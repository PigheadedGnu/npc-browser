/**
 * @author Felix Müller aka syl3r86
 * @version 0.1
 */

class NPCBrowser extends Application {

    constructor(app) {
        super(app);
        
        // load settings
        Hooks.on('ready', e => {
            // creating game setting container
            game.settings.register("NPCBrowser", "settings", {
                name: "NPC Browser Settings",
                hint: "Settings to exclude packs from loading",
                default: "",
                type: String,
                scope: 'world',
                onChange: settings => {
                    this.settings = JSON.parse(settings);
                }
            });

            // load settings from container
            let settings = game.settings.get('NPCBrowser', 'settings');
            if (settings == '') { // if settings are empty create the settings data
                console.log("NPC Browser | Creating settings");
                settings = {};
                for (let compendium of game.packs) {
                    if (compendium['metadata']['entity'] == "Actor") {
                        settings[compendium.collection] = {
                            load: true,
                            name: `${compendium['metadata']['label']} (${compendium.collection})`
                        };
                    }
                }
                game.settings.set('NPCBrowser', 'settings', JSON.stringify(settings));
            } else { // if settings do exist, reload and apply them to make sure they conform with current compendium
                console.log("NPC Browser | Loading settings"); 
                let loadedSettings = JSON.parse(settings);
                settings = {};
                for (let compendium of game.packs) {
                    if (compendium['metadata']['entity'] == "Actor") {
                        settings[compendium.collection] = {
                            // add entry for each item compendium, that is turned on if no settings for it exist already
                            load: loadedSettings[compendium.collection] == undefined ? true : loadedSettings[compendium.collection].load,
                            name: compendium['metadata']['label']
                        };
                    }
                }
            }
            this.settings = settings;
            this.settingsChanged = false;
            this.loadNPCs().then(obj => {
                this.npcs = obj
            });
        });
        this.hookCompendiumList();

        this.filters = {
            text: '',
            size: 'null',
            hasSpells: 'null',
            isLegendary: 'null',
            cr: { mode: 'null', val: '' },
            abilities: {
                str: { mode: 'null', val: '' },
                dex: { mode: 'null', val: '' },
                con: { mode: 'null', val: '' },
                int: { mode: 'null', val: '' },
                wis: { mode: 'null', val: '' },
                cha: { mode: 'null', val: '' },
            },
            dmgTypes: {
                deals: 'null',
                immune: 'null',
                resistance: 'null',
                vulnerable: 'null'
            },
            types: []
        }
    }

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.classes = options.classes.concat('npc-browser-window');
        options.template = "public/modules/npc-browser/template/npc-browser.html";
        options.width = 720;
        options.height = 700;
        return options;
    }

    hookCompendiumList() {
        Hooks.on('renderCompendiumDirectory', (app, html, data) => {

            const importButton = $(`<button class="npc-browser-btn" style="max-width: 84%;"><i class="fas fa-fire"></i> NPC Browser</button>`);
            const settingsButton = $('<button class="npc-browser-settings-btn" style="max-width: 10%;"><i class="fas fa-cog" title="Right click to reset settings."></i></button>');
            // slight diffrence in used buttons and layout depending on gm status

            html.find('.roll20-npc-import-list-btn').remove();
            html.find('.roll20-npc-import-list-settings-btn').remove();
            if (game.user.isGM) {
                html.find('.directory-footer').append(importButton);
                html.find('.directory-footer').append(settingsButton);
            }

            // Handle button clicks
            importButton.click(ev => {
                ev.preventDefault();
                this.render(true);
            });

            if (game.user.isGM) { // only add settings click event if the button exists
                settingsButton.mousedown(ev => {
                    let rightClick = ev.which === 3;
                    if (rightClick) {
                        this.resetSettings();
                    } else {
                        this.openSettings();
                    }
                });
            }
        });
    }

    async getData() {
        if (this.npcs == undefined || this.settingsChanged == true) {
            // spells will be stored locally to not require full loading each time the browser is opened
            this.npcs = await this.loadNPCs();
            this.settingsChanged = false;
        }

        let data = {};
        data.npcs = this.npcs;
        data.sources = this.sources;
        data.sizes = this.sizes;
        data.types = this.types;
        data.damageTypes = CONFIG.damageTypes;
        return data;
    }

    async loadNPCs() {
        console.log('NPC Browser | Started loading spells');
        
        let npcs = {};
        let sourcesArr = [];
        let typesArr = [];

        let sizes = {
            tiny: { label: 'Tiny', value: 0 },
            small: { label: 'Small', value: 2 },
            medium: { label: 'Medium', value: 3 },
            large: { label: 'Large', value: 4 },
            huge: { label: 'Huge', value: 5 },
            gargantuan: { label: 'Gargantuan', value: 6 }
        };
        let extraSizeValue = 7;

        for (let pack of game.packs) {
            if (pack['metadata']['entity'] == "Actor" && this.settings[pack.collection].load) {
                await pack.getContent().then(async content => {
                    console.log('something');
                    for (let npc of content) {
                        // add needed data
                        npc.compendium = pack.collection;
                        // cr display
                        let cr = npc.data.data.details.cr.value;
                        if (cr == undefined || cr == '') cr = 0;
                            else cr = Number(cr);
                        if (cr > 0 && cr < 1) cr = "1/" + (1 / cr);
                        npc.displayCR = cr;
                        // has spells
                        npc.hasSpells = false;
                        for (let item of npc.data.items) {
                            if (item.type == 'spell') {
                                npc.hasSpells = true;
                                break;
                            }
                        }


                        // collect attributes for filters

                        // sources
                        if (npc.data.data.details.source.value !== undefined && sourcesArr.includes(npc.data.data.details.source.value) === false) {
                            sourcesArr.push(npc.data.data.details.source.value.trim());
                        }

                        // sizes
                        if (npc.data.data.traits.size.value !== undefined && sizes[npc.data.data.traits.size.value] !== undefined) {
                            sizes[npc.data.data.traits.size.value.toLowerCase().trim()] = {
                                label: npc.data.data.traits.size.value,
                                value: extraSizeValue++
                            };
                        }
                        // types
                        let type = npc.data.data.details.type.value;
                        if (type.indexOf('(') != -1) {
                            let subype = type.split('(')[1].replace(')', '').trim();
                            type = type.split('(')[0].trim();
                            if (typesArr.includes(type) === false) typesArr.push(type);
                            if (typesArr.includes(subype) === false) typesArr.push(subype);
                        } else if (type !== undefined && type !== '' && typesArr.includes(type) === false) {
                            typesArr.push(type.trim());
                        }
                        npcs[npc._id] = npc;
                    }
                });
            }
        }

        this.sources = sourcesArr.sort();
        this.sizes = sizes;
        this.types = typesArr.sort();   
        console.log('NPC Browser | Finished loading NPCs');
        return npcs;
    }

    openSettings() {
        let content = "<p> Which compendium should be loaded? Uncheck any compendie that you don't want to use</p>";
        for (let key in this.settings) {
            content += `<div><input type=checkbox name="${key}" ${this.settings[key].load?'checked=true':''}><label>${this.settings[key].name}</label></div>`;
        }
        
        let d = new Dialog({
            title: "NPC Browser settings",
            content: content+'<br>',
            buttons: {
                save: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Save",
                    callback: html => {
                        
                    }
                },
            },
            default:'save',
            close: html => {
                let inputs = html.find('input');
                for (let input of inputs) {
                    this.settings[input.name].load = input.checked;
                }
                console.log("NPC Browser | Saving new Settings");
                game.settings.set('NPCBrowser', 'settings', JSON.stringify(this.settings));
                this.settingsChanged = true;
                this.loadNPCs().then(obj => {
                    this.spells = obj
                });
            }
        }, { width: "300px" });
        d.render(true);
    }

    resetSettings() {
        let d = new Dialog({
            title: "NPC Browser settings",
            content: "Reset settings to default?",
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Continue",
                    callback: html => {
                        console.log("NPC Browser | Creating settings");
                        let settings = {};
                        for (let compendium of game.packs) {
                            if (compendium['metadata']['entity'] == "Item") {
                                settings[compendium.collection] = {
                                    load: true,
                                    name: `${compendium['metadata']['label']} (${compendium.collection})`
                                };
                            }
                        }
                        game.settings.set('NPCBrowser', 'settings', JSON.stringify(settings));
                        this.settings = settings;
                    }
                },
                no: {
                    icon: '<i class="fas fa-ban"></i>',
                    label: "Continue"
                }
            }
        });
        d.render(true);
    }

    activateListeners(html) {
        //$(html).css('min-height', $(html.find('.control-area')).height() + 'px');

        // show spell card
        html.find('.npc-edit').click(ev => {
            let npcId = $(ev.currentTarget).parents(".npc").attr("data-entry-id");
            let npc = this.npcs[npcId];
            npc.sheet.render(true);
        });

        // make draggable
        html.find('.draggable').each((i, li) => {
            li.setAttribute("draggable", true);
            li.addEventListener('dragstart', event => {
                let packName = li.getAttribute("data-entry-compendium");
                let pack = game.packs.find(p => p.collection === packName);
                if (!pack) {
                    event.preventDefault();
                    return false;
                }
                event.dataTransfer.setData("text/plain", JSON.stringify({
                    type: pack.entity,
                    pack: pack.collection,
                    id: li.getAttribute("data-entry-id")
                }));
            }, false);
        });

        // toggle visibility of filter containers
        html.find('.filtercontainer h3').click(ev => {
            $(ev.target.nextElementSibling).toggle(100, e => {
                //$(html).css('min-height', $(html.find('.control-area')).height() + 'px');
            });
        });

        // toggle hints
        html.find('input[name=textFilter]').mousedown(ev => {
            if (event.which == 3) {
                $(html.find('.hint')).toggle(100, e => {
                    //$(html).css('min-height', $(html.find('.control-area')).height() + 'px');
                });
            }
        });
        

        // sort npc list
        html.find('select[name=sortorder]').on('change', ev => {
            let npcList = html.find('li');
            let orderBy = ev.target.value;
            let sortedList = this.sortNpcs(npcList, orderBy);
            let ol = $(html.find('ul'));
            ol[0].innerHTML = [];
            for (let element of sortedList) {
                ol[0].append(element);
            }
        });

        // activating or deactivating filters
        // text filter
        html.find('input[name=textFilter]').on('change paste', ev => {
            this.filters.text = ev.target.value;
            this.filterNpcs(html.find('li'));
        });
        // size filter
        html.find('#sizefilter select').on('change', ev => {
            this.filters.size = ev.target.value;
            this.filterNpcs(html.find('li'));
        });
        // hasSpells filter
        html.find('#hasSpellsfilter select').on('change', ev => {
            this.filters.hasSpells = ev.target.value;
            this.filterNpcs(html.find('li'));
        });
        // isLegendary filter
        html.find('#isLegendaryfilter select').on('change', ev => {
            this.filters.isLegendary = ev.target.value;
            this.filterNpcs(html.find('li'));
        });
        // cr filter
        html.find('#crfilter select').on('change', ev => {
            //let nullFilter = ((ev.target.value == null || ev.target.value == 'null') || (html.find('#crfilter input').value == ''));
            this.filters.cr.mode = ev.target.value;
            this.filterNpcs(html.find('li'));
        });
        html.find('#crfilter input').on('change', ev => {
            let value = ev.target.value;
            if (value != '' && value.indexOf('/') != -1)
                value = Number(value.split('/')[0]) / Number(value.split('/')[1]);
            this.filters.cr.val = value;

            this.filterNpcs(html.find('li'));
        });

        // filters abilities
        html.find('#abiliyfilter select').on('change', ev => {
            this.filters.abilities[ev.target.dataset.ability].mode = ev.target.value;
            this.filterNpcs(html.find('li'));
        });
        html.find('#abiliyfilter input').on('change', ev => {
            this.filters.abilities[ev.target.dataset.ability].val = ev.target.value;
            this.filterNpcs(html.find('li'));
        });

        // ability interaction filters
        html.find('#dmgtypeinteraction select').on('change', ev => {
            this.filters.dmgTypes[ev.target.dataset.filter] = ev.target.value;
            this.filterNpcs(html.find('li'));
        });

        // type filter
        html.find('#typefilter input').on('click', ev => {
            let type = ev.target.dataset.type;
            if (ev.target.checked) {
                this.filters.types.push(type);
            } else {
                this.filters.types = this.filters.types.filter(item => item != type);
            }
            this.filterNpcs(html.find('li'));
        });
    }

    sortNpcs(list, orderBy) {
        switch (orderBy) {
            case 'name':
                list.sort((a, b) => {
                    let aName = $(a).find('.npc-name a')[0].innerHTML;
                    let bName = $(b).find('.npc-name a')[0].innerHTML;
                    if (aName < bName) return -1;
                    if (aName > bName) return 1;
                    return 0;
                }); break;
            case 'cr':
                list.sort((a, b) => {
                    let aVal = Number($(a).find('input[name="details.cr"]').val());
                    let bVal = Number($(b).find('input[name="details.cr"]').val());
                    if (aVal < bVal) return -1;
                    if (aVal > bVal) return 1;
                    if (aVal == bVal) {
                        let aName = $(a).find('.npc-name a')[0].innerHTML;
                        let bName = $(b).find('.npc-name a')[0].innerHTML;
                        if (aName < bName) return -1;
                        if (aName > bName) return 1;
                        return 0;
                    }
                }); break;
            case 'size':
                list.sort((a, b) => {
                    let aVal = $(a).find('input[name="traits.size"]').val().toLowerCase().trim();
                    if (aVal == undefined || aVal == '' || this.sizes[aVal] == undefined) {
                        aVal = -1;
                    } else {
                        aVal = this.sizes[aVal].value
                    }
                    let bVal = $(b).find('input[name="traits.size"]').val().toLowerCase();
                    if (bVal == undefined || bVal == '' || this.sizes[bVal] == undefined) {
                        bVal = -1;
                    } else {
                        bVal = this.sizes[bVal].value
                    }
                    if (aVal < bVal) return -1;
                    if (aVal > bVal) return 1;
                    if (aVal == bVal) {
                        let aName = $(a).find('.npc-name a')[0].innerHTML;
                        let bName = $(b).find('.npc-name a')[0].innerHTML;
                        if (aName < bName) return -1;
                        if (aName > bName) return 1;
                        return 0;
                    }
                }); break;
        }
        return list;
    }

    filterNpcs(li) {
        for (let spell of li) {
            if (this.getFilterResult(spell) == false) {
                $(spell).hide();
            } else {
                $(spell).show();
            }
        }
    }

    getFilterResult(element) {
        if (this.filters.text != '') {
            let strings = this.filters.text.split(',');
            for (let string of strings) {
                let targetValue = string.toLowerCase().trim();
                let targetStat = '';
                let operation = '';
                if (targetValue.indexOf(':') != -1) {
                    targetValue = string.split(':')[1].trim();
                    targetStat = string.split(':')[0].trim();
                    operation = ':';
                } else if (targetValue.indexOf('=') != -1) {
                    targetValue = string.split('=')[1].trim();
                    targetStat = string.split('=')[0].trim();
                    operation = '=';
                } else if (targetValue.indexOf('<') != -1) {
                    targetValue = string.split('<')[1].trim();
                    targetStat = string.split('<')[0].trim();
                    operation = '<';
                } else if (targetValue.indexOf('>') != -1) {
                    targetValue = string.split('>')[1].trim();
                    targetStat = string.split('>')[0].trim();
                    operation = '>';
                } 
                if (operation == '') {
                    if ($(element).find('.npc-name a')[0].innerHTML.toLowerCase().indexOf(targetValue) == -1) {
                        return false;
                    }
                } else {
                    let npc = this.npcs[element.dataset.entryId];
                    let foundAttribute = false;
                    for (let sectionId in npc.data.data) {
                        let section = npc.data.data[sectionId];
                        for (let attributeId in section) {
                            if (targetStat == attributeId || targetStat == section[attributeId].label) {
                                foundAttribute = true;
                                let attributeValue = section[attributeId].value;
                                if (typeof attributeValue == 'string') {
                                    attributeValue = attributeValue.toLowerCase().trim();
                                    operation = ':';
                                } else {
                                    if (operation == ':') operation = '=';
                                    targetValue = Number(targetValue);
                                }
                                switch (operation) {
                                    case ':': if (attributeValue.indexOf(targetValue) == -1) return false; break;
                                    case '=': if (attributeValue != targetValue) { return false; } break;
                                    case '<': if (attributeValue >= targetValue) { return false; } break;
                                    case '>': if (attributeValue <= targetValue) { return false; } break;
                                }
                                break;
                            }
                        }
                        if (foundAttribute == true) break;
                    }
                    if (!foundAttribute) return false;
                }
            }
        }
        if(this.filters.size != 'null') {
            let size = $(element).find('input[name="traits.size"]').val();
            if (size.toLowerCase().trim() != this.filters.size) {
                return false;
            }
        }
        if (this.filters.hasSpells != 'null') {
            let hasSpells = $(element).find('input[name="hasSpells"]').val();
            if (hasSpells != this.filters.hasSpells) {
                return false;
            }
        }
        if (this.filters.isLegendary != 'null') {
            let legAct = $(element).find('input[name="resources.legact"]').val();
            let legRes = $(element).find('input[name="resources.legres"]').val();
            let isLeg = (legAct > 0 || legRes > 0) ? 'true' : 'false';
            if (isLeg != this.filters.isLegendary) {
                return false;
            }
        }
        if (this.filters.cr.mode != 'null' && this.filters.cr.val != '') {
            let cr = Number($(element).find('input[name="details.cr"]').val());
            switch (this.filters.cr.mode) {
                case '=': if (cr != this.filters.cr.val) return false; break;
                case '>': if (cr <= this.filters.cr.val) return false; break;
                case '<': if (cr >= this.filters.cr.val) return false; break;
            }
        }
        for (let ability in this.filters.abilities) {
            if (this.filters.abilities[ability].mode != 'null' && this.filters.abilities[ability].val != '') {
                let value = Number($(element).find(`input[name="abilities.${ability}"]`).val());
                switch (this.filters.abilities[ability].mode) {
                    case '=': if (value != this.filters.abilities[ability].val) return false; break;
                    case '>': if (value <= this.filters.abilities[ability].val) return false; break;
                    case '<': if (value >= this.filters.abilities[ability].val) return false; break;
                }
            }            
        }
        for (let dmgTypeFilter in this.filters.dmgTypes) {
            if (this.filters.dmgTypes[dmgTypeFilter] != 'null') {
                let targetType = this.filters.dmgTypes[dmgTypeFilter];
                if (dmgTypeFilter == 'deals') {
                    // get items
                    let items = this.npcs[element.dataset.entryId].items;
                    // go through items to see if one deals the required type of dmg
                    let foundDmgType = false;
                    for (let item of items) {
                        if (item.data.damageType != undefined) {
                            if (item.data.damageType.value == targetType || (item.type == 'weapon' && item.data.damage2Type.value == targetType)) {
                                foundDmgType = true;
                                break;
                            }
                        }
                    }
                    if (!foundDmgType) return false;
                    continue;
                }
                let value = '';
                switch (dmgTypeFilter) {
                    case 'immune': value = $(element).find(`input[name="traits.di"]`).val().toLowerCase(); break;
                    case 'resistance': value = $(element).find(`input[name="traits.dr"]`).val().toLowerCase(); break;
                    case 'vulnerable': value = $(element).find(`input[name="traits.dv"]`).val().toLowerCase(); break;
                }
                if (value.indexOf(targetType) == -1) return false;
            }
        }

        if (this.filters.types.length > 0) {
            let npcType = $(element).find('input[name="details.type"]').val();
            let foundType = false;
            for (let type of this.filters.types) {
                if (npcType.indexOf(type) != -1) {
                    foundType = true
                    break;
                }
            }
            if (!foundType) return false;
        }
        return true;
    }

    clearObject(obj) {
        let newObj = {};
        for (let key in obj) {
            if (obj[key] == true) {
                newObj[key] = true;
            }
        }
        return newObj;
    }
}
let npcBrowser = new NPCBrowser();