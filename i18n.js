// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';

import { IS_UNITTEST, PACKAGE_ID, PACKAGE_TITLE } from "../consts.js";


// We want to load the EN language by default, in order to use it for polyfill while i18n hasn't loaded yet
// The import/fetch below will allow Rollup, with rollup-plugin-json and rollup-plugin-jscc, to directly include the JSON contents into the build artifact
// but also still allow libWrapper to work fine without the rollup step.

/*#if _ROLLUP
import en_json from '../../lang/en.json';
const i18nLangs = $_I18N_LANGS;
const langBaseUrl = (!import.meta?.url?.endsWith(`dist/${PACKAGE_ID}.js`)) ? './lang' : '../lang';
//#else */
const langBaseUrl = '../../lang';
let en_json;
if(IS_UNITTEST) {
	// Use readFileSync, supported by node
	const fs = await import('fs');
	const en_file = fs.readFileSync('lang/en.json'); // readFileSync does not use a relative path
	en_json = JSON.parse(en_file);
}
else {
	// Use fetch - supported by browsers
	const request = await fetch(new URL(`${langBaseUrl}/en.json`, import.meta.url));
	en_json = await request.json();
}
//#endif


// Polyfill game.i18n until libWrapper initialises
export class i18n {
	static async _fetch(lang) {
		/*#if _ROLLUP
		// Avoid unnecessary requests if we know they're just going to 404
		if(Array.isArray(i18nLangs) && !i18nLangs.includes(lang))
			return null;
		//#endif */

		// Fetch language JSONs, if any
		try {
			const url = new URL(`${langBaseUrl}/${lang}.json`, import.meta.url);

			const request = await fetch(url);
			if(request.status !== 200 || !request.ok)
				return null;

			return request.json();
		}
		catch(e) {
			console.warn(`${PACKAGE_TITLE}: Failed to load or parse ${url.href}.`, e);
			return null;
		}
	}

	static async init() {
		// Default members
		this.jsons = [];

		// Load languages
		const langs = [];

		try {
			// client-scoped setting, but we do this before game.settings has initialised so have to grab it manually
			const clientLanguageSetting = localStorage?.['core.language'];
			if(clientLanguageSetting) {
				const clientLanguage = JSON.parse(clientLanguageSetting);
				if(clientLanguage && clientLanguage !== 'en')
					langs.push(clientLanguage);
			}
		}
		catch(e) {
			console.debug(`${PACKAGE_TITLE}: Could not find or parse client language settings.`);
		}

		const serverLanguage = game?.i18n?.lang;
		if(serverLanguage && serverLanguage !== 'en')
			langs.push(serverLanguage);

		// Fetch language JSONs
		if(langs.length > 0) {
			// Await all fetches
			const results = await Promise.all(langs.map((x)=>this._fetch(x)));

			// Store the valid results in this.jsons
			for(const json of results) {
				if(json)
					this.jsons.push(json);
			}
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
			if(this.jsons) {
				for(const json of this.jsons) {
					const res = split.reduce((x,y) => x?.[y], json);
					if(res)
						return res;
				}
			}

			// Default to just returning the key
			return split.reduce((x,y) => x?.[y], en_json) ?? key;
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