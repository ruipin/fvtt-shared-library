// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';

import {PACKAGE_ID, PACKAGE_TITLE} from '../consts.js';
import {Enum} from './enums.js';
import {i18n} from './i18n.js';
import {Log} from './log.js';
import {game_version} from './polyfill.js';


//*********************
// ID types
export const PACKAGE_TYPES = Enum('PackageType', [
	"UNKNOWN",
	"MODULE",
	"SYSTEM",
	"WORLD"
]);


//*********************
// Constants
const KEY_SEPARATOR = ':';
const UNKNOWN_ID = '\u00ABunknown\u00BB';
const PACKAGE_ID_REGEX = new RegExp("^[a-z0-9_-]+$", "i");
const STACK_TRACE_REGEX = /^.*?\/(worlds|systems|modules)\/(.+?)(?=\/).*?$/igm;

// A package ID string, or an array of package ID strings, that should be ignored when automatically detecting the package ID based on a stack trace.
// Not set as a constant, so that a default value can be set by the user
export let IGNORE_PACKAGE_IDS = PACKAGE_ID;


//*********************
// Utility methods

/**
 * @returns {boolean} Returns 'false' if aborted early (because of 'matchFn' returning 'false'), 'true' if executed to completion.
 */
const foreach_package_in_stack_trace = function(matchFn, stack_trace, ignore_ids) {
	// If supplied, stack_trace must be a string
	if(stack_trace !== undefined) {
		if(typeof stack_trace !== 'string')
			throw new Error(`${PACKAGE_TITLE}: Parameter 'stack_trace' must be a string, got ${typeof stack_trace}.`);
	}
	// Collect stack trace if none passed
	else {
		const old_stack_limit = Error.stackTraceLimit;

		try {
			Error.stackTraceLimit = Infinity;
			stack_trace = Error().stack;
		}
		finally {
			Error.stackTraceLimit = old_stack_limit;
		}

		// Simply exit if not a string
		if(typeof stack_trace !== 'string')
			return true;
	}

	// If the stack trace is empty, just exit
	if(!stack_trace)
		return true;

	// Apply regex onto stack trace
	const matches = stack_trace.matchAll(STACK_TRACE_REGEX);
	if(!matches)
		return true;

	// Find matches
	for(const match of matches) {
		const type = match[1];
		const name = match[2];

		if(!type || !name)
			continue;

		// Check for match
		let match_id, match_type;

		if(type === 'worlds') {
			const game_world_id = game?.data?.world?.id;
			if(game_world_id && name != game_world_id)
				continue;

			match_id   = name;
			match_type = PACKAGE_TYPES.WORLD;
		}
		else if(type === 'systems') {
			const game_system_id = game?.data?.system?.id;
			if(game_system_id && name != game_system_id)
				continue;

			match_id   = name;
			match_type = PACKAGE_TYPES.SYSTEM;
		}
		else if(type === 'modules') {
			if(game?.modules && !game.modules.has(name))
				continue;

			if(ignore_ids && (name === ignore_ids || ignore_ids?.includes?.(name)))
				continue;

			match_id   = name;
			match_type = PACKAGE_TYPES.MODULE;
		}
		else {
			throw new Error(`${PACKAGE_TITLE}: Invalid script type: ${type}`);
		}

		// On match, call matchFn, and return if it returns 'false'
		const matchRes = matchFn(match_id, match_type, match[0]);
		if(matchRes === false)
			return false;
	}

	// Done
	return true;
}


//*********************
// Package info class
// Stores package information. Able to auto-detect the package ID that is calling libWrapper.
export class PackageInfo {
	/*
	 * Static methods
	 */
	static get UNKNOWN() {
		return new PackageInfo(UNKNOWN_ID, PACKAGE_TYPES.UNKNOWN);
	};

	static collect_all(stack_trace=undefined, include_fn=undefined, ignore_ids=undefined) {
		// Collect a set of all packages in the stack trace
		const set = new Set();

		foreach_package_in_stack_trace((id, type, match) => {
			const key = `${type.lower}${KEY_SEPARATOR}${id}`; // see 'get key' below

			if(set.has(key))
				return true;

			if(include_fn !== undefined && !include_fn(id, type, match))
					return true;

			set.add(key);
			return true;
		}, stack_trace, ignore_ids);

		// Convert the set into an array of PackageInfo objects
		const modules = [];

		for(const key of set)
			modules.push(new PackageInfo(key));

		// Done
		return modules;
	}

	static is_valid_key_or_id(key_or_id) {
		return this.is_valid_key(key_or_id) || this.is_valid_id(key_or_id);
	}

	static is_valid_key(key) {
		if(!key || typeof key !== 'string')
			return false;

		const [id, type] = this.parse_key(key);
		if(!id || !type)
			return false;

		if(!this.is_valid_id(id))
			return false;

		return true;
	}

	static is_valid_id(id) {
		if(!id || typeof id !== 'string')
			return false;

		if(!PACKAGE_ID_REGEX.test(id))
			return false;

		return true;
	}

	static parse_key(key) {
		const split = key.split(KEY_SEPARATOR);
		if(split.length !== 2)
			return [null, null];

		const id   = split[1];
		const type = PACKAGE_TYPES.get(split[0]);

		return [id, type];
	}



	/*
	 * Constructor
	 */
	constructor(id=null, type=null) {
		this.set(id, type);
	}


	/*
	 * Member methods
	 */
	set(id=null, type=null, freeze=true) {
		// Auto-detect the ID
		if(!id)
			return this.detect_id();

		// Sanity check the ID
		if(typeof id !== 'string')
			throw new Error(`${PACKAGE_TITLE}: PackageInfo IDs must be strings`);

		// Handle unknown package
		if(id === UNKNOWN_ID) {
			this.set_unknown();
			return;
		}

		// If we need to auto-detect the type, and find a key separator, we should parse the ID as a key instead
		if(type === null) {
			if(this.from_key(id, /*fail=*/false))
				return; // from_key returning 'true' means that it succeeded and has called set(id, type) successfuly
		}

		// Validate ID (if we got this far, 'id' must be an ID, and not a key)
		if(!this.constructor.is_valid_id(id))
			throw new Error(`${PACKAGE_TITLE}: Invalid package ID '${id}'`);

		// Validate type
		if(type !== null && !PACKAGE_TYPES.has(type))
			throw new Error(`${PACKAGE_TITLE}: Package type for '${id}' must belong to the PACKAGE_TYPES enum, but got '${type}'.`);

		// Store in instance
		this.id = id;
		this.type = type;

		// Detect type automatically, if necessary
		if(!type)
			this.detect_type();

		// Freeze if requested
		if(freeze)
			Object.freeze(this);
	}

	set_unknown() {
		this.id = UNKNOWN_ID;
		this.type = PACKAGE_TYPES.UNKNOWN;
	}

	equals(obj) {
		return obj && (obj.constructor === this.constructor) && (obj.id === this.id) && (obj.type === this.type);
	}

	detect_id(stack_trace=undefined) {
		this.set_unknown();

		foreach_package_in_stack_trace((id, type) => {
			this.set(id, type);
			return false; // stop on first match
		}, stack_trace, IGNORE_PACKAGE_IDS);
	}

	detect_type() {
		// We need to support this even when 'game.modules' hasn't been initialised yet
		if(!game?.modules) {
			if(this.id === PACKAGE_ID)
				this.type = PACKAGE_TYPES.MODULE;
			else
				this.type = PACKAGE_TYPES.UNKNOWN;

			return;
		}

		if(game.modules?.get(this.id)?.active)
			this.type = PACKAGE_TYPES.MODULE;
		else if(this.id === game.data?.system?.id)
			this.type = PACKAGE_TYPES.SYSTEM;
		else if(this.id === game.data?.world?.id)
			this.type = PACKAGE_TYPES.WORLD;
		else
			this.type = PACKAGE_TYPES.UNKNOWN;
	}


	// Conversion to/from key
	from_key(key, fail=true) {
		const [id, type] = this.constructor.parse_key(key);

		if(!id || !type) {
			if(fail)
				throw new Error(`${PACKAGE_TITLE}: Invalid key '${key}'`);
			return false;
		}

		this.set(id, type);
		return true;
	}


	// Cast to string
	toString() {
		return this.key;
	}


	/*
	 * Attributes
	 */
	get known() {
		return this.type != PACKAGE_TYPES.UNKNOWN;
	}

	get exists() {
		switch(this.type) {
			case PACKAGE_TYPES.MODULE:
				return game.modules.get(this.id)?.active;
			case PACKAGE_TYPES.SYSTEM:
				return game.data.system.id === this.id;
			case PACKAGE_TYPES.WORLD:
				return game.data.world.id === this.id;
			default:
				return false;
		}
	}

	get data() {
		if(!this.exists)
			return null;

		switch(this.type) {
			case PACKAGE_TYPES.MODULE:
				return game.modules.get(this.id);
			case PACKAGE_TYPES.SYSTEM:
				return game.data.system;
			case PACKAGE_TYPES.WORLD:
				return game.data.world;
			default:
				return null;
		}
	}

	static get unknown_title() {
		return i18n.localize(`${PACKAGE_ID}.packages.unknown-title`)
	}

	get title() {
		if(!this.exists)
			return this.constructor.unknown_title;

		switch(this.type) {
			case PACKAGE_TYPES.MODULE:
			case PACKAGE_TYPES.SYSTEM:
			case PACKAGE_TYPES.WORLD :
				return this.data.title;
			default:
				return this.constructor.unknown_title;
		}
	}

	get key() {
		return `${this.type.lower}${KEY_SEPARATOR}${this.id}`;
	}

	get type_i18n() {
		return i18n.localize(`${PACKAGE_ID}.packages.types.${this.type.lower}`);
	}

	get type_plus_id() {
		return `${this.type.lower} ${this.id}`;
	}

	get type_plus_id_capitalized() {
		let str = this.type_plus_id;
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	get type_plus_id_i18n() {
		return i18n.format(`${PACKAGE_ID}.packages.type-plus-id`, {type: this.type_i18n, id: this.id});
	}

	get type_plus_title() {
		return `${this.type.lower} ${this.title}`;
	}

	get type_plus_title_i18n() {
		return i18n.format(`${PACKAGE_ID}.packages.type-plus-title`, {type: this.type_i18n, title: this.title});
	}

	get logId() {
		return (this.type == PACKAGE_TYPES.MODULE) ? this.id : this.key;
	}

	get settingsName() {
		switch(this.type) {
			case PACKAGE_TYPES.MODULE:
				return this.id;
			case PACKAGE_TYPES.SYSTEM:
				return `${this.id} [System]`;
			case PACKAGE_TYPES.WORLD:
				return `${this.id} [World]`;
			default:
				return this.id;
		}
	}

	get url() {
		return this.data?.url;
	}

	get bugs() {
		return this.data?.bugs;
	}

	get version() {
		return this.data?.version;
	}

	get core_version_range() {
		const data = this.data;
		if(!data)
			return null;

		// FVTT v10 and newer
		if(data.compatibility)
			return [data.compatibility.minimum, data.compatibility.verified, data.compatibility.maximum];

		// FVTT v9 and older
		return [data.minimumCoreVersion, data.compatibleCoreVersion, null];
	}

	get compatible_with_core() {
		const versions = this.core_version_range;
		const fvtt_version = game_version(/*return_null=*/ true);
		const fvtt_major = fvtt_version?.split('.')[0];

		if(!versions || !fvtt_version || !fvtt_major)
			return true; // assume it is compatible if we aren't sure

		// Check if the core version is between the minimum and maximum version
		const [min, verif, max] = versions;

		// Minimum version
		if(min) {
			const fvtt_min = min.includes('.') ? fvtt_version : fvtt_major;
			if(min !== fvtt_min && !isNewerVersion(fvtt_min, min))
				return false;
		}

		// Verified version
		if(verif) {
			const fvtt_verif = verif.includes('.') ? fvtt_version : fvtt_major;
			if(isNewerVersion(fvtt_verif, verif))
				return false;
		}

		// Maximum version
		if(max) {
			const fvtt_max = max.includes('.') ? fvtt_version : fvtt_major;
			if(fvtt_max == max || isNewerVersion(fvtt_max, max))
				return false;
		}

		// Done
		return true;
	}
}
Object.freeze(PackageInfo);