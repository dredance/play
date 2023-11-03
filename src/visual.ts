// "use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration
import DataViewObjects = powerbi.DataViewObject
import ISelectionId = powerbi.visuals.ISelectionId

import IColorPalette = powerbi.extensibility.IColorPalette;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import * as d3 from 'd3'
import Fill = powerbi.Fill
import ISelectionManager = powerbi.extensibility.ISelectionManager
import { descending } from "d3";
import DataViewCategoricalColumn = powerbi.DataViewCategoricalColumn
import { IFilterColumnTarget, BasicFilter, IBasicFilter  } from "powerbi-models";



////////////////////////////////////
interface VisualSettings {        
    transitionSettings: {
        autoStart: boolean;
        loop: boolean;
        timeInterval: number;
    };
    colorSelector: {
        pickedColor: Fill;
        showAll: boolean;
        playColor: Fill;
        pauseColor: Fill;
        stopColor: Fill;
        previousColor: Fill;
        nextColor: Fill;
    };
    captionSettings: {
        show: boolean;
        captionColor: Fill;
        fontSize: number;
        align: string;
    };
};
interface CategoryDataPoint {
    category: string;
    selectionId: ISelectionId;
    selected: boolean;
};
interface ViewModel {
    dataPoints: CategoryDataPoint[];
    settings: VisualSettings;
};
export function getValue<T>(objects: DataViewObjects, objectName: string, propertyName: string, defaultValue: T ): T {
    if(objects) {
        let object = objects[objectName];
        if(object) {
            let property: T = <T>object[propertyName];
            if(property !== undefined) {
                return property;
            }
        }
    }
    return defaultValue;
};


function visualTransform(options: VisualUpdateOptions, host: IVisualHost): ViewModel {
    let dataViews = options.dataViews;
    let categorical = dataViews[0].categorical;
    let category = categorical.categories[0];
    let categoryDataPoints: CategoryDataPoint[] = [];
    let colorPalette: IColorPalette = host.colorPalette;
    let objects = dataViews[0].metadata.objects;
    
    let defaultSettings: VisualSettings = {
        transitionSettings: {
            autoStart: false,
            loop: false,
            timeInterval: 2000,
        },
        colorSelector: {
            pickedColor: { solid: { color: "#000000" } },
            showAll: false,
            playColor: { solid: { color: "#f2c811" } },
            pauseColor: { solid: { color: "#1769b8" } },
            stopColor: { solid: { color: "#f42550" } },
            previousColor: { solid: { color: "#12b159" } },
            nextColor: { solid: { color: "#a81de8" } },
        },
        captionSettings: {
            show: true,
            captionColor: { solid: { color: "#000000" } },
            fontSize: 16,
            align: "left",
        }
    };

    let visualSettings: VisualSettings = {
        transitionSettings: {
            autoStart: getValue<boolean>(objects, 'transitionSettings', 'autoStart', defaultSettings.transitionSettings.autoStart),
            loop: getValue<boolean>(objects, 'transitionSettings', 'loop', defaultSettings.transitionSettings.loop),
            timeInterval: getValue<number>(objects, 'transitionSettings', 'timeInterval', defaultSettings.transitionSettings.timeInterval),
        },
        colorSelector: {
            pickedColor: getValue<Fill>(objects, 'colorSelector', 'pickedColor', defaultSettings.colorSelector.pickedColor),
            showAll: getValue<boolean>(objects, 'colorSelector', 'showAll', defaultSettings.colorSelector.showAll),
            playColor: getValue<Fill>(objects, 'colorSelector', 'playColor', defaultSettings.colorSelector.playColor),
            pauseColor: getValue<Fill>(objects, 'colorSelector', 'pauseColor', defaultSettings.colorSelector.pauseColor),
            stopColor: getValue<Fill>(objects, 'colorSelector', 'stopColor', defaultSettings.colorSelector.stopColor),
            previousColor: getValue<Fill>(objects, 'colorSelector', 'previousColor', defaultSettings.colorSelector.previousColor),
            nextColor: getValue<Fill>(objects, 'colorSelector', 'nextColor', defaultSettings.colorSelector.nextColor),
        },
        captionSettings: {
            show: getValue<boolean>(objects, 'captionSettings', 'show', defaultSettings.captionSettings.show),
            captionColor: getValue<Fill>(objects, 'captionSettings', 'captionColor', defaultSettings.captionSettings.captionColor),
            fontSize: getValue<number>(objects, "captionSettings", "fontSize", defaultSettings.captionSettings.fontSize),
            align: getValue<string>(objects, "captionSettings", "align", defaultSettings.captionSettings.align),
        }
    }

    for (let i = 0, len = Math.max(category.values.length); i < len; i++) {
        categoryDataPoints.push({
            category: category.values[i] + '',
            selectionId: host.createSelectionIdBuilder()
                .withCategory(category, i)
                .createSelectionId(),
            selected: false
        });
    }

    return {
        dataPoints: categoryDataPoints,
        settings: visualSettings
    };
};

//////////////////////////////
function isDataReady(options: VisualUpdateOptions) {
    if(!options
    || !options.dataViews
    || !options.dataViews[0]
    || !options.dataViews[0].categorical
    || !options.dataViews[0].categorical.categories
    || !options.dataViews[0].categorical.categories[0].source)
    {
        return false;
    }

    return true;                         
}    

enum Status {Play, Pause, Stop}

//////////////////////////////

export class Visual implements IVisual {
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private svg: d3.Selection<SVGElement,any,any,any>;
    private controlsSVG: d3.Selection<SVGElement,any,any,any>;
    private captionSVG: d3.Selection<SVGElement,any,any,any>;
    private visualDataPoints: CategoryDataPoint[];
    private visualSettings: VisualSettings;
    private status: Status;
    private lastSelected: number;
    private endSelected: number;
    private viewModel: ViewModel;
    private fieldName: string;
    private timers: any;
    private options: VisualUpdateOptions;
    private currentSelected: ISelectionId[];

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();
        this.status = Status.Pause;
        this.timers = [];            

        let buttonNames = ["play", "pause", "previous","next"];
        let buttonPath = [
                "M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-3 17v-10l9 5.146-9 4.854z", 
                "M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-1 17h-3v-10h3v10zm5-10h-3v10h3v-10z", 
                // "M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-1 17h-3.5v-10h9v10z",
                "M22 12c0 5.514-4.486 10-10 10s-10-4.486-10-10 4.486-10 10-10 10 4.486 10 10zm-22 0c0 6.627 5.373 12 12 12s12-5.373 12-12-5.373-12-12-12-12 5.373-12 12zm13 0l5-4v8l-5-4zm-5 0l5-4v8l-5-4zm-2 4h2v-8h-2v8z",
                "M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-6 16v-8l5 4-5 4zm5 0v-8l5 4-5 4zm7-8h-2v8h2v-8z"
               ];

        this.svg = d3.select(options.element).append("svg")
             .attr("width","100%")
             .attr("height","100%");

        //Append caption text           
        this.captionSVG = this.svg.append('svg');
        let captionBox = this.captionSVG.append('g');
        let select = `<foreignObject x=120 y=0 width=150 height="90">
                <select id="label">
                    <option value="volvo" selected>OKRES</option>
                <select>
        </foreignObject>`
        captionBox.html(select);
        // captionBox.append('text')
        //     .attr('dy','0.22em')
        //     .attr('id','label');
        

        this.controlsSVG = this.svg.append('svg');
        for (let i = 0; i < buttonNames.length; ++i) {
            let container = this.controlsSVG.append('g')
             .attr('class', "controls")
             .attr('transform','translate(' + 30*i + ')')
             .attr('id', buttonNames[i]); 
            container.append("path")
            .attr("d", buttonPath[i]);
         }
        

        //Events on click
        this.svg.select("#play").on("click", () => {
            this.playAnimation();
        });
        // this.svg.select("#stop").on("click", () => {
        //     this.stopAnimation();
        // });
        this.svg.select("#pause").on("click", () => {
            this.pauseAnimation();
        });     
        this.svg.select("#previous").on("click", () => {
            this.step(-1);
        });     
        this.svg.select("#next").on("click", () => {
            this.step(1);
        });  
        this.svg.select("#label").on("change", () => {
            this.updateSelect();
        });  
        
        this.resetAnimation(false);
        
    }
     

    public update(options: VisualUpdateOptions) {


        if (isDataReady(options) == false) {
            return;
        }
        
        this.options = options;
        let viewModel = this.viewModel = visualTransform(options, this.host);
        this.visualSettings = viewModel.settings;
        this.visualDataPoints = viewModel.dataPoints;   

        // ostatni okres i zaznaczenie
        this.endSelected = this.visualDataPoints.length-1;

        try {
            // let sMan = this.selectionManager.getSelectionIds() as ISelectionId[];
            const newSelect = this.viewModel.dataPoints[this.lastSelected].category
            const sel = <HTMLSelectElement> this.captionSVG.select("#label").node();//<HTMLSelectElement>document.getElementById('#label');
            var opt = sel.options[sel.selectedIndex];

            if (opt.text==newSelect) {
                return;
                // this.lastSelected = sMan[0].getSelector()['data'][0]['identityIndex'];
            } else {
                this.lastSelected = this.endSelected;
            }
            
        } catch {
            this.lastSelected = this.endSelected;
        }

        const jsonFilters = options.jsonFilters as BasicFilter[];
        if (jsonFilters.length > 0
            && jsonFilters[0]
            && jsonFilters[0].values
        ) {
            const numer:number = <number> jsonFilters[0].values[0]
            this.lastSelected = +numer;
        } else {
            this.lastSelected = this.endSelected;
        }


        this.applyFilter()


        this.selectionManager.clear();
        this.selectionManager.select(this.viewModel.dataPoints[this.endSelected].selectionId)
            // .then((ids: ISelectionId[]) => {
            //     console.log('dada',ids)
            // this.visualDataPoints.forEach(dataPoint => {
            //     ids.forEach(bookmarkSelection => {
            //         if (bookmarkSelection.equals(dataPoint.selectionId)) {
            //             dataPoint.selected = true;
            //         }})})});
        this.controlButton();
        
        // this.updateCaption(this.viewModel.dataPoints[this.lastSelected].category);
        //Start playing without click 
        if (this.visualSettings.transitionSettings.autoStart) { 
            this.playAnimation();
        }

        //Change colors         
        if (this.visualSettings.colorSelector.showAll) {
            let playColor = viewModel.settings.colorSelector.playColor.solid.color;
            let pauseColor = viewModel.settings.colorSelector.pauseColor.solid.color;
            let stopColor = viewModel.settings.colorSelector.stopColor.solid.color;
            let previousColor = viewModel.settings.colorSelector.previousColor.solid.color;
            let nextColor = viewModel.settings.colorSelector.nextColor.solid.color;
            this.svg.selectAll("#play").attr("fill", viewModel.settings.colorSelector.playColor.solid.color);
            this.svg.selectAll("#pause").attr("fill", viewModel.settings.colorSelector.pauseColor.solid.color);
            // this.svg.selectAll("#stop").attr("fill", viewModel.settings.colorSelector.stopColor.solid.color);
            this.svg.selectAll("#previous").attr("fill", viewModel.settings.colorSelector.previousColor.solid.color);
            this.svg.selectAll("#next").attr("fill", viewModel.settings.colorSelector.nextColor.solid.color);
        } else {
            let pickedColor = viewModel.settings.colorSelector.pickedColor.solid.color;
            this.svg.selectAll(".controls").attr("fill", viewModel.settings.colorSelector.pickedColor.solid.color);
        }
          

        //Change caption color and font size
        let captionColor = viewModel.settings.captionSettings.captionColor.solid.color;    
        let fontSize = viewModel.settings.captionSettings.fontSize;
        this.svg.select("#label").attr("style",`font-size: ${fontSize}px;color: ${captionColor}`);

        // //Check if field name has changed and update accordingly
        // if (this.fieldName != options.dataViews[0].categorical.categories[0].source.displayName) {
        //     this.fieldName = options.dataViews[0].categorical.categories[0].source.displayName;
        //     this.resetAnimation(this.visualSettings.transitionSettings.autoStart);
        // }

        //Change ////////////////////////////////           
        if (this.visualSettings.captionSettings.show) {   
            
            if (this.status != Status.Play) {
                this.updateCaption(this.viewModel.dataPoints[this.lastSelected].category); 
            }    

            let node: any = <SVGElement>this.svg.select("#label").node();
            let TextBBox = node.getBBox();
        
            let viewBoxWidth = 155 + TextBBox.width;
            this.controlsSVG
            .attr("viewBox","0 0 " + viewBoxWidth + " 24")
            .attr('preserveAspectRatio','xMinYMid');
            
        } else {
            this.svg.select("#label").text("");
            this.controlsSVG
            .attr("viewBox","0 0 145 24")
            .attr('preserveAspectRatio','xMinYMid'); 
        }

        // //Update selection if bookmarked was clicked
        // let ids = this.selectionManager.getSelectionIds() as ISelectionId[];
        // if(ids.length == 1 && (this.status != Status.Play)) { //Number of selected ids should be 1 and status different than play
        //     this.visualDataPoints.forEach((dataPoint, index) => {
        //         if(ids[0].includes(dataPoint.selectionId)) {
        //             this.lastSelected = index;  
        //             this.pauseAnimation();
        //             this.step(0);
        //             return;
        //         }
        //     });
        // }


    }

    public resetAnimation(autoStart : boolean) {
        this.lastSelected = -1;

        if (autoStart) {
            this.svg.selectAll("#play, #next, #previous").attr("opacity", "0.3");
            this.svg.selectAll("#stop, #pause").attr("opacity", "1");
        } else {
            //Setup initial state of buttons
            this.svg.selectAll("#previous, #pause,  #next").attr("opacity", "0.3"); 
            this.svg.selectAll("#play").attr("opacity", "1"); 
        }
    }

    public playAnimation() {              
        if (this.status == Status.Play) return;

        this.svg.selectAll("#play, #next, #previous").attr("opacity", "0.3");
        this.svg.selectAll("#stop, #pause").attr("opacity", "1");

        let timeInterval = this.viewModel.settings.transitionSettings.timeInterval;
        if (this.lastSelected==this.viewModel.dataPoints.length-1){this.lastSelected=-1}; // jeżesli jest na końcu
        let startingIndex = this.lastSelected + 1;


        for (let i = startingIndex; i < this.viewModel.dataPoints.length; ++i) {                           
            let timer = setTimeout(() => {
                this.selectionManager.select(this.viewModel.dataPoints[i].selectionId);
                this.lastSelected = i;
                this.updateCaption(this.viewModel.dataPoints[i].category); 
            }, (i - this.lastSelected) * timeInterval); 
            this.timers.push(timer);
        }

        //replay or stop after one cycle
        let stopAnimationTimer = setTimeout(() => {
            if(this.visualSettings.transitionSettings.loop) {
                this.status = Status.Stop;
                this.lastSelected = -1;
                this.playAnimation();
            } else {
                this.stopAnimation();
            }
        }, (this.viewModel.dataPoints.length - this.lastSelected) * timeInterval); 
        this.timers.push(stopAnimationTimer);
        this.status = Status.Play;

        this.applyFilter()
    }                

    public stopAnimation() {
        if (this.status == Status.Stop) return; 
        
        this.svg.selectAll("#pause, #next, #previous").attr("opacity", "0.3");
        this.svg.selectAll("#play").attr("opacity", "1");
        for (let i of this.timers) {
            clearTimeout(i);
        }
        this.endSelected = this.visualDataPoints.length-1
        this.updateCaption(this.viewModel.dataPoints[this.endSelected].category);
        // this.updateCaption(this.fieldName);
        this.lastSelected = this.endSelected;
        this.selectionManager.clear();
        this.selectionManager.select(this.viewModel.dataPoints[this.endSelected].selectionId);
        this.controlButton();
        this.status = Status.Pause;
        
    }

    public pauseAnimation() {
        if (this.status == Status.Pause || this.lastSelected == -1) return;                                       

        this.svg.selectAll("#pause").attr("opacity", "0.3");
        this.svg.selectAll("#play, #stop").attr("opacity", "1"); 
        for (let i of this.timers) {
            clearTimeout(i); 
        } 
        this.controlButton();
        this.status = Status.Pause;
    }

    public step(step: number) {
        if (this.status == Status.Play || this.status == Status.Stop) return;                                       
        
        //Check if selection is within limits
        if ((this.lastSelected + step) < 0 || (this.lastSelected + step) > (this.viewModel.dataPoints.length-1)) return;

        let previousButtonOpacity = (this.lastSelected + step) == 0 ? 0.3 : 1;
        let nextButtonOpacity = (this.lastSelected + step) == (this.viewModel.dataPoints.length-1) ? 0.3 : 1;

        this.svg.selectAll("#previous").attr("opacity", previousButtonOpacity);
        this.svg.selectAll("#next").attr("opacity", nextButtonOpacity);

        this.lastSelected = this.lastSelected + step;
        this.selectionManager.select(this.viewModel.dataPoints[this.lastSelected].selectionId);
        this.updateCaption(this.viewModel.dataPoints[this.lastSelected].category);
        this.status = Status.Pause;
        
    }

    public updateCaption(caption: string) {
        if (this.visualSettings.captionSettings.show) {
            const lista = this.viewModel.dataPoints.map(d=>d.category).sort(descending)//[this.endSelected].category)
            let option = ""
            for(let okres in lista){
                option+=`<option value=${lista.length-1-+okres} ${lista[okres]==caption?'selected':''}>${lista[okres]}</option>`
            }
            
            this.svg.select("#label").html(option);
            
        }
    }

    public updateSelect() {
        const valueSelect = (document.getElementById("label") as HTMLInputElement);
        this.lastSelected=+valueSelect.value
        // console.log(valueSelect.value);
        this.selectionManager.select(this.viewModel.dataPoints[valueSelect.value].selectionId);
        // this.pauseAnimation();
        this.status = Status.Pause;
        this.controlButton();
        
        this.applyFilter()
    }

    public controlButton(){
        //////////////////STEP
        let previousButtonOpacity = this.lastSelected <= 0 ? 0.3 : 1;
        let nextButtonOpacity = this.lastSelected >= (this.viewModel.dataPoints.length-1) ? 0.3 : 1;

        this.svg.selectAll("#previous").attr("opacity", previousButtonOpacity);
        this.svg.selectAll("#next").attr("opacity", nextButtonOpacity);
        //////////////////

    }

    public applyFilter(){
        // this.options['jsonFilters'] = [this.lastSelected]
        let categories: DataViewCategoricalColumn = this.options.dataViews[0].categorical.categories[0];
        let target: IFilterColumnTarget = {
            table: categories.source.queryName.substr(0, categories.source.queryName.indexOf('.')), // table
            column: categories.source.displayName // col1
        };
        const filter = new BasicFilter(
            target,
            "In",
            +this.lastSelected
            );
        this.host.applyJsonFilter(filter, "general", "filter", powerbi.FilterAction.merge);
    }

    /**
     * Enumerates through the objects defined in the capabilities and adds the properties to the format pane
     *
     * @function
     * @param {EnumerateVisualObjectInstancesOptions} options - Map of defined objects
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        let objectName = options.objectName;
        let objectEnumeration: VisualObjectInstance[] = [];

        switch(objectName) {            
            case 'transitionSettings': 
                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        autoStart: this.visualSettings.transitionSettings.autoStart,
                        loop: this.visualSettings.transitionSettings.loop,
                        timeInterval: this.visualSettings.transitionSettings.timeInterval
                    },
                    validValues: {
                        timeInterval: {
                            numberRange: {
                                min: 1,
                                max: 60000
                            }
                        }
                    },
                    selector: null
                });
            break;
            case 'colorSelector':
                if (this.visualSettings.colorSelector.showAll) {
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {                                
                            showAll: this.visualSettings.colorSelector.showAll,
                            playColor: {
                                solid: {
                                    color: this.visualSettings.colorSelector.playColor.solid.color
                                }
                            },
                            pauseColor: {
                               solid: {
                                   color: this.visualSettings.colorSelector.pauseColor.solid.color
                               }
                            },
                            stopColor: {
                               solid: {
                                   color: this.visualSettings.colorSelector.stopColor.solid.color
                               }
                            },
                            previousColor: {
                               solid: {
                                   color: this.visualSettings.colorSelector.previousColor.solid.color
                               }
                            },
                            nextColor: {
                                solid: {
                                   color: this.visualSettings.colorSelector.nextColor.solid.color
                               }
                            }
                        },
                        selector: null
                    });
                }  else {
                    objectEnumeration.push({
                    objectName: objectName,
                        properties: {
                            showAll: this.visualSettings.colorSelector.showAll,
                            pickedColor: {
                                solid: {
                                    color: this.visualSettings.colorSelector.pickedColor.solid.color
                                }
                            }
                        },
                        selector: null
                    });
                }          
            break;
            case 'captionSettings':
                objectEnumeration.push({
                    objectName: objectName,
                    properties: {
                        show: this.visualSettings.captionSettings.show,
                        captionColor: {
                            solid: {
                                color: this.visualSettings.captionSettings.captionColor.solid.color
                            }
                        },
                        align: this.visualSettings.captionSettings.align,
                        fontSize: this.visualSettings.captionSettings.fontSize
                    },
                    validValues: {
                        fontSize: {
                            numberRange: {
                                min: 8,
                                max: 22
                            }
                        }
                    },
                    selector: null
                });
            break;
        };
        return objectEnumeration;
    }
}
