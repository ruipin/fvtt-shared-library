// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';

import {PACKAGE_TITLE, PACKAGE_ID} from '../consts.js';


//*********************
// Versioning

// This allows rollup to optimise the version-related code
/*#if _ROLLUP

	export const VERSION = $_PACKAGE_VERSION;

//#else */

	// Utility method to simplify throwing exceptions when parsing the manifest version
	const throw_error = (msg) => { throw new Error(`${PACKAGE_TITLE}: ${msg}.\nFoundry might not have initialized properly, please try refreshing.`) };

	// This method will be used by Rollup to feed the JSCC pre-processor
	export const _parse_manifest_version = function(version, git_hash) {
		// Default to a sane value
		const known = (typeof version === 'string');
		if(!known)
			version = '1.99.99.99';

		// Parse version string
		const match = version.match(/^([0-9]+)\.([0-9]+)\.([0-9]+).([0-9]+)(.*)$/i);
		if(!match)
			throw_error(`Unable to parse version string '${version_str}'`);

		const result = {
			known  : known,
			full   : version,
			major  : parseInt(match[1]),
			minor  : parseInt(match[2]),
			patch  : parseInt(match[3]),
			suffix : parseInt(match[4]),
			meta   : match[5],
		};

		// Process git hash
		result.git       = git_hash ?? 'unknown';
		result.git_short = (result.git.length >= 40) ? result.git.slice(0,7) : result.git;
		result.full_git  = `${result.full} (${result.git_short})`

		// Done
		return result;
	}

	// This method is fallback, and only used when running libWrapper directly from the source code without going through the Rollup build step first
	// e.g. during unit tests
	export const parse_manifest_version = function() {
		if(VERSION.known)
			return;

		try {
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

			// Grab git version (no need to validate)
			const git_hash = manifest.flags?.git_version;

			// Grab version string
			const version_str = manifest.version;
			if(!version_str)
				throw_error("Unable to find version string inside package manifest");

			// Done
			VERSION = _parse_manifest_version(version_str, git_hash);
		}
		catch(e) {
			console.error(e);
			Hooks?.once('ready', () => globalThis?.ui?.notifications?.error?.(e));
		}
	}

	export let VERSION = _parse_manifest_version(null, null);

//#endif


//*********************
// Test for a minimum version
export const version_at_least = function(major, minor=0, patch=0, suffix=0) {
	if(VERSION.major == major) {
		if(VERSION.minor == minor) {
			if(VERSION.patch == patch) {
				return VERSION.suffix == suffix;
			}

			return VERSION.patch >= patch;
		}

		return VERSION.minor > minor;
	}
	return VERSION.major > major;
}