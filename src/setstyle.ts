'use strict'

import {VisualSettings} from './settings'


export function setStyle(s: VisualSettings): void {
    const style = document.documentElement.style
    style.setProperty('--default-color', s.slicerSettings.defaultColor)
    style.setProperty('--selected-color', s.slicerSettings.selectedColor)
    style.setProperty('--text-align', s.slicerSettings.textAlign)
    style.setProperty('--padding-bottom', `${s.slicerSettings.paddingBottom}px`)
    style.setProperty('--margin-bottom', `${s.slicerSettings.marginBottom}px`)
    style.setProperty('--font-family', s.slicerSettings.fontFamily)
    style.setProperty('--font-size', `${s.slicerSettings.fontSize}pt`)
    style.setProperty('--underline-width', `${s.slicerSettings.underlineWidth}px`)
}