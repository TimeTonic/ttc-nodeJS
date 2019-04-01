'use strict';
const log = require('debug')('TTCBook.js');

const request = require('request-promise');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const TTC_API_REQUEST_GET_TABLES = 'getBookTables';
const TTC_API_REQUEST_GET_VALUES = 'getTableValues';
const TTC_API_REQUEST_CREATE_OR_UPDATE_ROW = 'createOrUpdateTableRow';
const TTC_API_REQUEST_CREATE_OR_UPDATE_ROWS = 'createOrUpdateTableRows';

const WRITE_BATCH_SIZE = 200;

class Book {
	constructor (options) {
		this.b_c = options.b_c;
		this.b_o = options.b_o;
		this.u_c = options.u_c;
		this.sesskey = options.sesskey;
		this.endpoint = options.endpoint;
		this.version = options.version;
		this.admin = options.admin;
	}

	getRequestOptions() {
		return {
			method: 'POST',
			uri: this.endpoint,
			form: {
				'version': this.version,
				'o_u': this.admin ? this.admin.u_c : this.u_c,
				'u_c': this.admin ? this.admin.u_c : this.u_c,
				'sesskey': this.admin ? this.admin.sesskey : this.sesskey
			},
			json: true,
			timeout: 120000
		};
	}

	fetchTables() {
		return new Promise((resolve, reject) => {
			const options = this.getRequestOptions();
			options.form.b_c = this.admin ? this.admin.b_c : this.b_c;
			options.form.b_o = this.admin ? this.admin.b_o : this.b_o;
			options.form.includeFields = true;
			options.form.req = TTC_API_REQUEST_GET_TABLES;
			request(options)
				.then(parsedBody => {
					if (parsedBody.status === 'ok') {
						if (this.stopped) {
							return reject(Error('sync interrupted by user'));
						}
						this.tables = parsedBody.bookTables.categories
							.filter(cat => !cat.sysFunc)
							.filter(cat => !cat.pivot_id);
						return resolve();
					} else {
						return reject(new Error(parsedBody.errorMsg));
					}
					
				})
				.catch(reject);
		});
	}

	fetchTableValues(tableId, filter) {
		return new Promise((resolve, reject) => {
			if (!filter && this.tables && this.tables[tableId]) {
				return resolve();
			}
			const options = this.getRequestOptions();
			options.form.req = TTC_API_REQUEST_GET_VALUES;
			options.form.catId = tableId;
			if (filter) {
				options.form.filterRowIds = filter;
			}
			request(options)
				.then(parsedBody => {
					if (parsedBody.status === 'ok') {
						if (!this.tables) {
							this.tables = [parsedBody.tableValues];
						}
						for (let i = 0; i < this.tables.length; i++) {
							const table = this.tables[i];
							if (table.id === tableId) {
								table.fields = parsedBody.tableValues.fields;
								return resolve();
							}
						}
						return reject(new Error('table with id ' + tableId + ' not found'));
					}
					return reject(new Error(parsedBody.errorMsg));
				})
				.catch(reject);
		});
	}

	getTableWithCode(code) {
		return new Promise((resolve, reject) => {
			if (!this.tables) {
				return reject(new Error('no tables yet. please use fetchTables before getTableWithCode'));
			}
			for (let i = 0; i < this.tables.length; i++) {
				const table = this.tables[i];
				if (table.code === code) {
					return resolve(table);
				}
			}
			return reject(new Error('no table found with code ' + code));
		});
	}

	getUserMapping(mappingId, userId, mappedUserId) {
		return new Promise ((resolve, reject) => {
			if (this.userMapping) {
				return resolve(this.userMapping);
			}
			this.getTableWithCode(mappingId)
				.then(table => this.fetchTableValues(table.id))
				.then(tableValues => {
					const keys = [], values = [];
					for (let i = 0; i < tableValues.fields.length; i++) {
						const field = tableValues.fields[i];
						if (field.fixed_code === userId) {
							field.values.forEach(value => {
								values.push(value.value);
							});
							if (keys.length === values.length && values.length > 0) {
								break;
							}
						}
						else if (field.fixed_code === mappedUserId) {
							field.values.forEach(value => {
								keys.push(value.value);
							});
							if (keys.length === values.length && keys.length > 0) {
								break;
							}
						}
					}
					if (keys.length === values.length && values.length > 0) {
						this.userMapping = {};
						for (let i = 0; i < keys.length; i++) {
							const key = keys[i], value = values[i];
							if (key) {
								this.userMapping[key] = value;
							}
						}
						resolve();
					}
					else {
						reject(new Error('could not resolve userMapping'));
					}
				})
				.catch(reject);
		});
	}

	getMappedUser(u_c) {
		return new Promise((resolve, reject) => {
			let userCode = u_c ? u_c : this.u_c;
			if (!this.userMapping) {
				return reject(new Error('call getUserMapping before calling getMappedUser'));
			}
			for (let i = 0; i < Object.values(this.userMapping).length; i++) {
				const value = Object.values(this.userMapping)[i];
				if (typeof value === 'string' && value.toLowerCase() === userCode.toLowerCase()) {
					return resolve(Object.keys(this.userMapping)[i]);
				}
			}
			return reject(new Error('could not find a mapped id for user ' + userCode));
		});
	}

	getFilterConfig(table, configs, operator) {
		return new Promise((resolve, reject) => {
			if (!operator) {
				operator = 'and';
			}
			let filters = [];
			if (!Array.isArray(configs)) {
				configs = [configs];
			}
			for (let i = 0; i < configs.length; i++) {
				const config = configs[i];
				if (!config.operand) {
					config.operand = 'is';
				}
				let fieldId;
				for (let j = 0; j < table.fields.length; j++) {
					const field = table.fields[j];
					if (field.fixed_code === config.key) {
						fieldId = field.id;
						break;
					}
				}
				if (!fieldId) {
					return reject(new Error('could not find a filter config for field ' + config.key));
				}
				filters.push({
					'id': `tmp${i}`,
					'json': {
						'predicate': config.operand,
						'operand': config.value
					},
					'field_id': fieldId,
					'filter_type': config.filterType ? config.filterType : 'text'
				});
			}
			
			resolve({
				tableId: table.id,
				filter: {
					'applyViewFilters': {
						'filterGroup': {
							'operator': operator,
							'filters': filters
						}
					}
				}
			});
		});
	}

	createOrUpdateTTCRowWithId(rowId, fieldValues) {
		return new Promise((resolve, reject) => {
			const options = this.getRequestOptions();
			if (fieldValues.rowId) {
				delete fieldValues.rowId;
			}
			options.form.req = TTC_API_REQUEST_CREATE_OR_UPDATE_ROW;
			options.form.rowId = rowId;
			options.form.fieldValues = fieldValues;
			options.form.bypassUrlTrigger = false;

			return request(options)
				.then(parsedBody => {
					if (parsedBody.status === 'ok') {
						if (Array.isArray(parsedBody.rows) && parsedBody.rows.length === 1) {
							resolve(parsedBody.rows[0].id);
						}
						else {
							reject(new Error('unabled to identify new row id'));
						}
					}
					else {
						reject(new Error(JSON.stringify(parsedBody)));
					}
				})
				.catch(reject);
		});
	}

	createOrUpdateTTCRow(fieldValues) {
		return new Promise((resolve, reject) => {
			log('createOrUpdateTTCRows');
			const filteredElementId = Object.values(fieldValues.filter)[0];
			const filter = {
				'applyViewFilters': {
					'filterGroup': {
						'operator': 'and',
						'filters': [{
							'id': 'tmpId',
							'json': {
								'predicate': 'is',
								'operand': filteredElementId
							},
							'field_id': Object.keys(fieldValues.filter)[0],
							'filter_type': 'text'
						}]
					}
				}
			};
			delete fieldValues.filter;
			const tableId = fieldValues.tableId;
			delete fieldValues.tableId;
			this.fetchTableValues(tableId, filter)
				.then(tableValues => {
					let rowId = `tmp${filteredElementId}`;
					if (Array.isArray(tableValues.fields) 
							&& tableValues.fields.length > 0
							&& Array.isArray(tableValues.fields[0].values)) {
						
						if (tableValues.fields[0].values.length === 1) {
							rowId = tableValues.fields[0].values[0].id;
						}
						else if (tableValues.fields[0].values.length > 1) {
							return reject(new Error(`ScaleUp found ${tableValues.fields[0].values.length} records for internal id ${filteredElementId}`));
						}
					}
					return this.createOrUpdateTTCRowWithId(rowId, fieldValues);
				})
				.then(resolve)
				.catch(reject);
		});
	}

	createOrUpdateTTCRows(rows) {
		log('createOrUpdateTTCRows: ' + Object.keys(rows).length + ' rows');
		return new Promise((resolve, reject) => {
			this.createOrUpdateTTCRowsPaged(rows, resolve, reject);
		});
	}

	createOrUpdateTTCRowsPaged(rows, resolve, reject) {
		if (Object.keys(rows).length === 0) {
			resolve();
			return;
		}
		log('createOrUpdateTTCRowsPaged', Object.keys(rows).length + ' remaining');
		const pagedRows = {};
		const rowIds = Object.keys(rows);
		const pageLength = Math.min(rowIds.length, WRITE_BATCH_SIZE);
		const pagedRowIds = [];
		for (let i = 0; i < pageLength; i++) {
			const rowId = rowIds[i];
			pagedRows[rowId] = rows[rowId];
			pagedRowIds.push(rowId);
		}

		const options = this.getRequestOptions();
		options.form.req = TTC_API_REQUEST_CREATE_OR_UPDATE_ROWS;
		options.form.rows = pagedRows;
		request(options)
			.then(parsedBody => {
				if (parsedBody.status === 'ok') {
					pagedRowIds.forEach(rowId => {
						delete rows[rowId];
					});
					if (Object.keys(rows).length) {
						return this.createOrUpdateTTCRowsPaged(rows, resolve, reject);
					}
					else {
						return resolve();
					}
				}
				else if (parsedBody.error && parsedBody.error.indexOf('Deadlock') > -1) {
					log('_createPagedTtcTableRows faced Deadlock: retrying');
					return this.createOrUpdateTTCRowsPaged(rows, resolve, reject);
				}
				else {
					reject(new Error(JSON.stringify(parsedBody)));
				}
			})
			.catch(reject);	
	}

	getFieldWithFixedCode(tableCode, fieldFixedCode) {
		return new Promise((resolve, reject) => {
			this.getTableWithCode(tableCode)
				.then(table => {
					for (let i = 0; i < table.fields.length; i++) {
						const field = table.fields[i];
						if (field.fixed_code === fieldFixedCode) {
							return resolve(field);
						}
					}
					return reject(new Error(`no field found with code ${fieldFixedCode} for table with code ${tableCode}`));
				})
				.catch(reject);
		});
	}

	stats(filepath) {
		return new Promise((resolve, reject) => {
			fs.stat(filepath, (err, stats) => {
				if (err) {
					return reject(err);
				}
				if (stats.size === 0) {
					return reject(new Error('attempt to upload an empty file'));
				}

				resolve(stats);
			});
		});
	}

	uploadFile(tableCode, fieldFixedCode, rowId, filepath, uuid, filename, mimetype) {
		return new Promise((resolve, reject) => {
			if (!uuid) {
				uuid = require('uuid/v1')();
			}
			if (!filename) {
				filename = path.basename(filepath);
			}
			if (!mimetype) {
				mimetype = mime.lookup(filepath);
			}
			
			this.stats(filepath)
				.then(() => this.getFieldWithFixedCode(tableCode, fieldFixedCode))
				.then(field => {
					let fieldId = field.id;
					const options = {
						method: 'POST',
						uri: this.endpoint,
						formData: {
							req: 'fileUpload',
							version: this.version,
							o_u: this.u_c,
							u_c: this.u_c,
							sesskey: this.sesskey,
							uuid: uuid,
							qqfile: {
								value: fs.createReadStream(filepath),
								options: {
									filename: filename,
									contentType: mimetype
								}
							},
							rowId: rowId,
							fieldId: fieldId
						},
						json: true
					};
					return request(options);
				})
				.then(response => {
					if (response.status !== 'ok') {
						return reject(new Error(JSON.stringify(response)));
					}
					resolve(response);
				})
				.catch(reject);
		});
	}
}

module.exports = Book;