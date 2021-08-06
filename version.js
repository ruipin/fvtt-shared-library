// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';

import {PACKAGE_TITLE, PACKAGE_ID} from '../consts.js';


//*********************
// Versioning

export let VERSION_KNOWN     = false;
export let VERSION           = '1.99.99.99';
export let MAJOR_VERSION     = 1;
export let MINOR_VERSION     = 99;
export let PATCH_VERSION     = 99;
export let SUFFIX_VERSION    = 99;
export let META_VERSION      = '';
export let GIT_VERSION       = 'unknown';
export let GIT_VERSION_SHORT = 'unknown';
export let VERSION_WITH_GIT  = '1.99.99.99 (unknown)';


export const parse_manifest_version = function() {
	if(VERSION_KNOWN)
		return;

	try {
		const throw_error = (msg) => { throw `${PACKAGE_TITLE}: ${msg}.\nFoundry might not have initialized properly, please try refreshing.` };

		// Get package manifest
		if(!game.modules)
			throw_error("Could not find 'game.modules'");

		if(!game.modules.size)
			throw_error("Map 'game.modules' is empty");

		const mdl = game.modules.get(PACKAGE_ID);
		if(!mdl)
			throw_error(`Could not find 'game.modules.get("${PACKAGE_ID}")'`);

		const manifest = mdl.data;
		if(!manifest)
			throw_error(`Could not find 'game.modules.get("${PACKAGE_ID}").data'`);

		// Grab git version
		GIT_VERSION       = manifest.flags?.git_version ?? 'unknown';
		GIT_VERSION_SHORT = (GIT_VERSION.length >= 40) ? GIT_VERSION.slice(0,7) : GIT_VERSION;

		// Parse version string
		const version_str = manifest.version;
		if(!version_str)
			throw_error("Unable to find version string inside package manifest");

		const match = version_str.match(/^([0-9]+)\.([0-9]+)\.([0-9]+).([0-9]+)(.*)$/i);
		if(!match)
			throw_error(`Unable to parse version string '${version_str}'`);

		VERSION        = match[0];
		MAJOR_VERSION  = parseInt(match[1]);
		MINOR_VERSION  = parseInt(match[2]);
		PATCH_VERSION  = parseInt(match[3]);
		SUFFIX_VERSION = parseInt(match[4]);
		META_VERSION   = match[5].replace(/^-/gi, '');

		// Conclude
		VERSION_WITH_GIT = `${VERSION} (${GIT_VERSION_SHORT})`;
		VERSION_KNOWN  = true;
	}
	catch(e) {
		console.error(e);
		Hooks?.once('ready', () => globalThis?.ui?.notifications?.error?.(e));
	}
}


//*********************
// Test for a minimum version
export const version_at_least = function(major, minor=0, patch=0, suffix=0) {
	if(MAJOR_VERSION == major) {
		if(MINOR_VERSION == minor) {
			if(PATCH_VERSION == patch) {
				return SUFFIX_VERSION == suffix;
			}

			return PATCH_VERSION >= patch;
		}

		return MINOR_VERSION > minor;
	}
	return MAJOR_VERSION > major;
}