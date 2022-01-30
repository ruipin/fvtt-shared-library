// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-shared-library Rui Pinheiro

'use strict';


import {PACKAGE_TITLE} from '../consts.js';


// Enumeration Value factory
export const EnumValue = function(enum_cls, name, value, sort=true) {
	// Sanity check for a frozen object
	if(Object.isFrozen(enum_cls))
		throw new Error(`${PACKAGE_TITLE}: Enum '${enum_cls.name}' is frozen.`);

	// Validate name
	if(name !== name.toUpperCase())
		throw new Error(`${PACKAGE_TITLE}: Enum keys must be all uppercase.`);

	// We use an eval here to coerce the browser to display more readable console output
	const value_cls = Function("x", `return class ${name} extends x {}`)(enum_cls.value_cls);
	const value_obj = new value_cls();

	if(value_obj.name != name)
		throw new Error(`${PACKAGE_TITLE}: Incorrect value_obj name ${value_obj.name}. Expected ${name}.`);

	// If we were provided a value, add it
	if(value !== undefined)
		value_obj.value = value;

	// We always freeze the temporary value class we just created
	Object.freeze(value_obj);
	Object.freeze(value_obj.prototype);
	Object.freeze(value_obj.constructor);
	Object.freeze(value_obj.constructor.prototype);

	// Store instance into enum
	if(name in enum_cls)
		throw new Error(`${PACKAGE_TITLE}: Name '${name}' is already present in ${enum_cls.name}.`);
	enum_cls[name] = value_obj;

	// Store value->object mapping too, if a value was provided
	if(value !== undefined) {
		if(enum_cls.reverse.has(value))
			throw new Error(`${PACKAGE_TITLE}: Value '${value}' is already present in ${enum_cls.name}.`);
		enum_cls.reverse.set(value, value_obj);
	}

	// Store key into list of keys - no need to check for duplicates
	enum_cls.list.push(value_obj);
	if(sort)
		enum_cls.sort_list_by_value();

	// Done
	return value_obj;
}



// Enumeration factory
export const Enum = function(name, collection, freeze=true) {
	let value_cls;

	// Validate name
	if(typeof name !== "string")
		throw new Error(`${PACKAGE_TITLE}: Enum name must be a string`);

	// Validate collection
	if(typeof collection !== "object")
		throw new Error(`${PACKAGE_TITLE}: Enum collection must be a dictionary or an array`);

	const has_value = !(collection instanceof Array);

	// Enum class
	const enum_name = `${name}Enum`;
	const enum_cls = {
		[enum_name]: class {
			constructor(value, dflt=undefined) {
				return this.constructor.get(value, dflt);
			}

			static get(value, dflt=undefined) {
				// If passing an enum value object directly, just return it
				if(value instanceof value_cls)
					return value;

				// If passing a key, return the corresponding object
				if(typeof value === "string") {
					const res = this[value.toUpperCase()];
					if(res)
						return res;
				}

				// If we got something else, this might be the actual enum "value" field
				{
					// Check the reverse map
					let reverse = this.reverse.get(value);

					// Also try casting to int, since values are often numbers
					if(reverse === undefined && typeof value === 'string') {
						const value_int = parseInt(value);
						if(Number.isInteger(value_int))
							reverse = this.reverse.get(value_int);
					}

					// Return the enum value if we found it
					if(reverse !== undefined)
						return reverse;
				}

				// Fail or return default value
				if(dflt === undefined)
					throw new Error(`${PACKAGE_TITLE}: '${value}' is not a valid key or value for the enum ${name}.`);

				return dflt;
			}

			static has(value) {
				return (value instanceof value_cls);
			}

			static toString() {
				return this.name;
			}

			static get value_cls() {
				return value_cls;
			}

			static sort_list_by_value() {
				return this.list.sort(function(a,b){
					return (a.value ?? 0) - (b.value ?? 0);
				});
			}
		}
	}[enum_name];

	// Value Class
	// Note: We need to use an eval here in order to coerce the browser to have the correct class name... Other tricks don't work.
	const value_cls_name = `${name}Value`;
	value_cls = {
		[value_cls_name]: class {
			static toString() {
				return value_cls_name;
			}

			get name() {
				return this.constructor.name;
			}

			get enum() {
				return enum_cls;
			}

			toString() {
				return this.name;
			}

			get lower() {
				return this.name.toLowerCase();
			}
		}
	}[value_cls_name];

	// We always freeze the value class
	Object.freeze(value_cls);
	Object.freeze(value_cls.prototype);

	// Extra Enum Class members
	enum_cls.list    = [];

	if(has_value)
		enum_cls.reverse = new Map();

	// Construct enum values
	if(collection instanceof Array) {
		for(const key of collection) {
			EnumValue(enum_cls, key, undefined, /*sort=*/false);
		}
	}
	else {
		for(const key in collection) {
			EnumValue(enum_cls, key, collection[key], /*sort=*/false);
		}
	}

	enum_cls.sort_list_by_value();

	// Freeze everything
	if(freeze) {
		Object.freeze(enum_cls);
		Object.freeze(enum_cls.prototype);
		Object.freeze(enum_cls.list);

		if(has_value)
			Object.freeze(enum_cls.reverse);
	}

	// Done
	return enum_cls;
}