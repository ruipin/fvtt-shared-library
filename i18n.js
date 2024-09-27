// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';

import { IS_UNITTEST, PACKAGE_ID } from "../consts.js";
import { game_settings_get } from "./polyfill.js";
import { Log } from "./log.js";


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
	/*
	 * Initialisation
	 */
	static init() {
		// Default members
		this.langs = [];
		this.jsons = {};

		// Load languages
		try {
			// client-scoped setting, but we do this before game.settings has initialised so have to grab it manually
			const clientLanguage = game_settings_get('core', 'language', /*always_fallback=*/ true, /*return_null=*/ false);
			if(clientLanguage && clientLanguage !== 'en')
				this.langs.push(clientLanguage);
		}
		catch(e) {
			Log.debug$?.(`Could not find or parse client language settings.`);
		}

		const serverLanguage = game?.i18n?.lang;
		if(serverLanguage && serverLanguage !== 'en')
			this.langs.push(serverLanguage);
	}

	static on_ready() {
		// Allow garbage collection of JSONs
		delete this.jsons;

		//#if !_ROLLUP
			en_json = undefined;
		//#endif
	}


	/*
	 * Polyfill
	 */
	static _fetch(lang) {
		// If the JSON is cached, return it
		const cached_json = this.jsons[lang];
		if(cached_json !== undefined)
			return cached_json;

		/*#if _ROLLUP
			// Avoid unnecessary requests if we know they're just going to 404
			if(Array.isArray(i18nLangs) && !i18nLangs.includes(lang))
				return null;
		//#endif */

		// Fetch language JSON if this is the first time we're using it
		const url = new URL(`${langBaseUrl}/${lang}.json`, import.meta.url);

		try {
			Log.debug$?.(`Fetching ${lang} language JSON...`);

			const request = new XMLHttpRequest();
			request.open("GET", url, /*async=*/ false);
			request.send(null);

			if(request.status !== 200)
				throw new Error(`Unexpected request status ${request.status}`);

			Log.debug$?.(`Fetched ${lang} language JSON.`);
			const json = JSON.parse(request.responseText);

			// Cache and return JSON
			this.jsons[lang] = json;
			return json;
		}
		catch(e) {
			Log.warn$?.(`Failed to load or parse ${url.href}. Skipping language.`, e);
			this.jsons[lang] = null;
			return null;
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
			for(const lang of this.langs) {
				const json = this._fetch(lang);
				if(!json)
					continue;

				const res = split.reduce((x,y) => x?.[y], json);
				if(res)
					return res;
			}

			// Default to just returning the key
			return split.reduce((x,y) => x?.[y], en_json) ?? key;
		}
		catch(e) {
			Log.error(e);
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
			Log.error(e);
			return key;
		}
	}
}

// Set up a hook to cleanup once we are no longer a polyfill
if(!IS_UNITTEST)
	Hooks.once('ready', i18n.on_ready.bind(i18n));