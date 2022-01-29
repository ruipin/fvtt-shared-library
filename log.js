// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';

import { PACKAGE_ID, PACKAGE_TITLE } from "../consts.js";
import { Enum } from './enums.js';
import { game_settings_get } from "./polyfill.js";
import { ERRORS } from '../errors/errors.js';


//*********************
// Constants
export const VERBOSITY = Enum('PackageType', {
	"ZERO"    :   0,
	"TRACE"   : 100,
	"DEBUG"   : 200,
	"INFO"    : 300,
	"WARNING" : 400,
	"ERROR"   : 500,
	"CRITICAL": Number.MAX_SAFE_INTEGER - 1,
	"ALWAYS"  : Number.MAX_SAFE_INTEGER
});

const VERBOSITY_ALIASES_MAP = {
	"NEVER": VERBOSITY.ZERO,
	"ALL"  : VERBOSITY.ZERO,
	"WARN" : VERBOSITY.WARNING
}

const VERBOSITY_CONSOLEFN_MAP = {
	[VERBOSITY.ZERO    .value]: [console, 'debug'],
	[VERBOSITY.TRACE   .value]: [console, 'debug'],
	[VERBOSITY.DEBUG   .value]: [console, 'debug'],
	[VERBOSITY.INFO    .value]: [console, 'info' ],
	[VERBOSITY.WARNING .value]: [console, 'warn' ],
	[VERBOSITY.ERROR   .value]: [console, 'error'],
	[VERBOSITY.CRITICAL.value]: [console, 'error'],
	[VERBOSITY.ALWAYS  .value]: [console, 'info' ]
};

const LOG_ALIASES_VERBOSITY_MAP = {
	never   : VERBOSITY.ZERO,
	trace   : VERBOSITY.TRACE,
	debug   : VERBOSITY.DEBUG,
	info    : VERBOSITY.INFO,
	warning : VERBOSITY.WARNING,
	warn    : VERBOSITY.WARNING,
	error   : VERBOSITY.ERROR,
	critical: VERBOSITY.CRITICAL,
	always  : VERBOSITY.ALWAYS
};


const LOG_PREFIX = `${PACKAGE_TITLE}:`;
const LOG_PREFIX_VERBOSITY_MAP = {
	[VERBOSITY.ZERO    .value]: `[0] ${LOG_PREFIX}`,
	[VERBOSITY.TRACE   .value]: `[T] ${LOG_PREFIX}`,
	[VERBOSITY.DEBUG   .value]: `[D] ${LOG_PREFIX}`,
	[VERBOSITY.INFO    .value]: `[I] ${LOG_PREFIX}`,
	[VERBOSITY.WARNING .value]: `[W] ${LOG_PREFIX}`,
	[VERBOSITY.ERROR   .value]: `[E] ${LOG_PREFIX}`,
	[VERBOSITY.CRITICAL.value]: `[!] ${LOG_PREFIX}`,
	[VERBOSITY.ALWAYS  .value]: LOG_PREFIX
};


//*********************
// Variables

// Current verbosity. Setting it to 'null' or 'undefined' results in the default verbosity value being used.
let CURRENT_VERBOSITY = null;


//*********************
// Utility functions
export const verbosity_to_value = function(verbosity) {
	// If no verbosity is provided, we default to a value of 0 (i.e. VERBOSITY.NEVER)
	if(verbosity === null || verbosity === undefined)
		return 0;

	// Otherwise, return value or verbosity
	return verbosity.value ?? verbosity;
}

export const verbosity_to_mapped_value = function(verbosity, map, dflt) {
	const value = verbosity_to_value(verbosity);

	// If the value is in the map, just use it
	{
		const result = map[value];
		if(result)
			return result;
	}

	// Use the nearest verbosity
	for(const v of VERBOSITY.list) {
		if(value > v.value)
			continue;

		return map[v.value];
	}

	// Default
	return dflt;
}

function verbosity_to_log_function(verbosity) {
	return verbosity_to_mapped_value(verbosity, VERBOSITY_CONSOLEFN_MAP, [console, 'log']);
}

function verbosity_to_log_prefix(verbosity, suffix) {
	return verbosity_to_mapped_value(verbosity, LOG_PREFIX_VERBOSITY_MAP, LOG_PREFIX);
}

function generate_verbosity_aliases() {
	for(const verbosity of VERBOSITY.list) {
		Log[verbosity.name] = verbosity;
	}

	for(const alias in VERBOSITY_ALIASES_MAP) {
		Log[alias] = VERBOSITY_ALIASES_MAP[alias];
	}
}

function generate_enabled_aliases() {
	for(const alias in LOG_ALIASES_VERBOSITY_MAP) {
		const verbosity = LOG_ALIASES_VERBOSITY_MAP[alias];

		Object.defineProperty(Log, `has_${alias}`, {
			get: Log.enabled.bind(Log, verbosity),
			configurable: false
		});
	}
}

function generate_log_aliases() {
	// Generic log aliases
	for(const alias in LOG_ALIASES_VERBOSITY_MAP) {
		const verbosity = LOG_ALIASES_VERBOSITY_MAP[alias];

		const fn = Log.fn(verbosity);

		// Default logging function, logs or does nothing depending on enabled verbosity
		Log[alias      ] = fn ?? (()=>{});

		// $-suffixed logging functions allow using optional chaining '?.' to easily skip evaluating
		// the function arguments (e.g. skip building the log message)
		// if the function would otherwise do nothing because of verbosity
		Log[`${alias}$`] = fn;
	}

	// Stack trace helper
	Log.stack = (console.trace && Log.has_trace) ? console.trace.bind(console) : (()=>{});
}



//*********************
// Logging helper class
export class Log {
	/*
	 * Attributes
	 */
	static get verbosity() {
		// Note: This default value is only used until LibWrapperSettings.init
		return CURRENT_VERBOSITY ?? VERBOSITY.WARNING;
	}

	static set verbosity(value) {
		// Convert to VERBOSITY type if it exists
		value = VERBOSITY.get(value, /*default=*/ value);

		// Sanity check types
		if(!VERBOSITY.has(value) && !Number.isInteger(value))
			throw new ERRORS.internal("Parameter 'value' must be a 'VERBOSITY' enum value, or an integer.");

		// Store verbosity
		CURRENT_VERBOSITY = value;

		// We generate the logging methods statically any time the verbosity changes in order to:
		// 1. Log with the highest performance possible (no need to dynamically check verbosity)
		// 2. Not affect the log file/line from the caller that is shown in the JS console
		generate_log_aliases();
	}

	static get verbosity_value() {
		return verbosity_to_value(this.verbosity);
	}

	static get verbosities() {
		return VERBOSITY;
	}


	/*
	 * Utility Methods
	 */
	static init(force=false) {
		// We do nothing if the verbosity is already set, unless forced
		if(!force && CURRENT_VERBOSITY !== undefined && CURRENT_VERBOSITY !== null)
			return;

		// Grab verbosity from settings
		let value = game_settings_get(PACKAGE_ID, 'log-verbosity', /*always_fallback=*/ true, /*return_null=*/ true);

		// We do nothing if the setting is null/undefined
		if(value === undefined || value === null) {
			// If 'force', we should regenerate the log aliases regardless of the fact we're not changing the verbosity
			if(force)
				generate_log_aliases();

			return;
		}

		this.verbosity = value;
	}

	static enabled(verbosity=null) {
		const desired_value = verbosity_to_value(verbosity);
		const current_value = this.verbosity_value;

		return (desired_value >= current_value);
	}


	/*
	 * Logging
	 */

	/* Returns a function to log at a given verbosity, or 'null' if the given verbosity is not enabled.
	 * You should use the optional chaining operator '?.' when calling the result.
	 * Can specify a different verbosity to use when calculating the underlying logging function, as well as a custom prefix
	 *
	 * Usage Examples:
	 *
	 * - 'DEBUG' message:
	 *   Log.fn(Log.DEBUG)?.("Some message");
	 *
	 * - 'ALWAYS' message using the underlying logging function for 'INFO' messages:
	 *   Log.fn(Log.ALWAYS, Log.INFO)?.("Another message");
	 */
	static fn(verbosity, fn_verbosity=verbosity) {
		if(!this.enabled(verbosity))
			return null;

		const [obj, nm] = verbosity_to_log_function(fn_verbosity);
		const prefix = verbosity_to_log_prefix(verbosity);
		return obj[nm].bind(obj, prefix);
	}

	/*
	 * Dynamic logging function. Verbosity check happens at call-time.
	 */
	static log(verbosity, ...args) {
		return this.fn(verbosity)?.(...args);
	}
}

// Generate static aliases
generate_verbosity_aliases();
generate_enabled_aliases();

// Initialise
Log.init(/*force=*/ true);

// Seal Log class
Object.seal(Log);