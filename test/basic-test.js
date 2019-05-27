/* global describe beforeEach afterEach it xit */
'use strict';

const assert = require('assert');
const TTC = require('../index');
const fs = require('fs');
const ini = require('ini');
const path = require('path');

const configPath = path.resolve(__dirname, 'config.ini');
const config = ini.parse(fs.readFileSync(configPath, 'utf-8'));

describe('TTCApi', () => {
	let readJson = path => {
		return new Promise((resolve, reject) => {
			fs.readFile(require.resolve(path), (err, data) => {
				if (err) {
					return reject(err);
				}
				resolve(JSON.parse(data));
			});
		});
	};
	let book;
	beforeEach(() => {
		book = new TTC.Book({
			b_c: config.b_c,
			b_o: config.b_o,
			u_c: config.u_c,
			sesskey: config.sesskey,
			endpoint: config.endpoint,
			version: config.version
		});
	});
	afterEach(() => {
		book = null;
	});
	describe('Book', () => {
		it('should fetchTables', () => {
			return book.fetchTables()
				.then(() => readJson('./resources/fetchTables.json'))
				.then(expected => {
					book.tables.forEach(table => {
						delete table.lastModified;
						delete table.sstamp;
					});
					expected.bookTables.categories.forEach(table => {
						delete table.lastModified;
						delete table.sstamp;
					});
					assert.deepEqual(book.tables, expected.bookTables.categories);
				})
				.catch(assert.fail);
		});
		it('should getTableWithCode', () => {
			let expected;
			return readJson('./resources/getTableWithCode.json')
				.then(table => {
					expected = table;
					return book.fetchTables();
				})
				.then(() => book.getTableWithCode('test_table_code'))
				.then(table => {
					assert.deepEqual(table, expected);
				})
				.catch(assert.fail);
		});
		it('should getFilterConfig', () => {
			let expected;
			return readJson('./resources/getFilterConfig.json')
				.then(filter => {
					expected = filter;
					return book.fetchTables();
				})
				.then(() => book.getTableWithCode('test_table_code'))
				.then(table => book.getFilterConfig(table, {
					key: 'description',
					value: 'First item'
				}))
				.then(filterConfig => {
					assert.deepEqual(filterConfig, expected);
				})
				.catch(assert.fail);
		});
		it('should fetchTableValues', () => {
			let expected;
			return readJson('./resources/fetchTableValues.json')
				.then(tableValues => {
					expected = tableValues;
					return book.fetchTables();
				})
				.then(() => book.getTableWithCode('test_table_code'))
				.then(table => book.fetchTableValues(table.id))
				.then(tableValues => {
					assert.deepEqual(tableValues, expected);
				})
				.catch(assert.fail);
		});
		it('should fetchTableValues with filter', () => {
			let expected;
			return readJson('./resources/fetchTableValuesWithFilter.json')
				.then(tableValues => {
					expected = tableValues;
					return book.fetchTables();
				})
				.then(() => book.getTableWithCode('test_table_code'))
				.then(table => book.getFilterConfig(table, {
					key: 'description',
					value: 'First item'
				}))
				.then(filterConfig => book.fetchTableValues(filterConfig.tableId, filterConfig.filter))
				.then(tableValues => {
					assert.deepEqual(tableValues, expected);
				})
				.catch(assert.fail);
		});
		it('should getFieldWithFixedCode', () => {
			let expected;
			return readJson('./resources/getFieldWithFixedCode.json')
				.then(field => {
					expected = field;
					return book.fetchTables();
				})
				.then(() => book.getFieldWithFixedCode('test_table_code', 'description'))
				.then(field => {
					delete field.lastModified;
					assert.deepEqual(field, expected);
				})
				.catch(assert.fail);
		});
		it('should getFieldWithCode', () => {
			let expected;
			return readJson('./resources/getFieldWithCode.json')
				.then(field => {
					expected = field;
					return book.fetchTables();
				})
				.then(() => book.getFieldWithCode('test_table_code', 'test_field_code'))
				.then(field => {
					delete field.lastModified;
					assert.deepEqual(field, expected);
				})
				.catch(assert.fail);
		});
		xit('should uploadFile', () => {
			let uuid = '45745c60-7b1a-11e8-9c9c-2d42b21b1a3e',
				path = require('path'),
				file = path.join(__dirname, 'resources', 'jean.jpg'),
				expected;
			return book.fetchTables()
				.then(() => readJson('./resources/uploadFile.json'))
				.then(uploadResult => {
					expected = uploadResult;
					return book.uploadFile('values', 'attachments', 19974813, file, uuid);
				})
				.then(uploadResult => {
					delete uploadResult.sstamp;
					delete uploadResult.id;
					delete uploadResult.internName;
					delete uploadResult.lastModified;
					delete uploadResult.createdVNB;
					delete uploadResult.mdc;
					delete uploadResult.media_id;
					assert.deepEqual(uploadResult, expected);
				})
				.catch(assert.fail);
		});

		xit('should cleanFiles', () => {

		});

		xit('should return tables as a map {} not an array', () => {});
	});
});