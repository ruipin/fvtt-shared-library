// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';

import { IS_UNITTEST } from "../consts.js";


// We want to load the EN language by default, in order to use it for polyfill when i18n hasn't loaded yet
// The import/fetch below will allow Rollup, with rollup-plugin-json and rollup-plugin-jscc, to directly include the JSON contents into the build artifact
// but also still allow libWrapper to work fine without the rollup step.

/*#if _ROLLUP
import en from '../../lang/en.json';
//#else */
let en;
if(IS_UNITTEST) {
	// Use readFileSync, supported by node
	const fs = await import('fs');
	let en_file = fs.readFileSync('lang/en.json');
	en = JSON.parse(en_file);
}
else {
	// Use fetch - supported by browsers
	const request = await fetch(new URL('../../lang/en.json', import.meta.url));
	en = await request.json();
}
//#endif


// Polyfill game.i18n until libWrapper initialises
export class i18n {
	static async init() {
		const lang = game?.i18n?.lang;
		if(!lang || lang === "en") // no need to fetch the english JSON since we already include it in our artifact
			return;

		const url = new URL(`../../lang/${lang}.json`, import.meta.url);
		try {
			const request = await fetch();
			if(request.status !== 200 || !request.ok)
				return;

			this.json = await request.json();
		}
		catch(e) {
			console.warn(`${PACKAGE_TITLE}: Failed to load or parse ${url.href}. Defaulting to built-in english translation until Foundry's i18n library initialises.`);
		}
	}

	static localize(key) {
		// Try real i18n library
		if(game?.i18n) {
			const res = game.i18n.localize(key);
			if(res !== key)
				return res;
		}

		// Fallback to polyfill
		try {
			const split = key.split('.');

			// Try main language first
			if(this.json) {
				const res = split.reduce((x,y) => x?.[y], this.json);
				if(res)
					return res;
			}

			// Default to built-in english translation
			return split.reduce((x,y) => x?.[y], en) ?? key;
		}
		catch(e) {
			console.error(e);
			return key;
		}
	}

	static format(key, args) {
		// Try real i18n library
		if(game?.i18n) {
			const res = game.i18n.format(key, args);
			if(res !== key)
				return res;
		}

		// Fallback to polyfill
		const localize = this.localize(key);
		if(localize === key)
			return localize;

		try {
			return localize.replace(/\{(.*?)\}/g, (_,y) => args?.[y]);
		}
		catch(e) {
			console.error(e);
			return key;
		}
	}
}