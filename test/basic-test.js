/* global describe beforeEach afterEach it */
'use strict';

const assert = require('assert');
const fs = require('fs');
const TTC = require('../index');

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
			b_c: 'mochatests',
			b_o: 'ttcapitester',
			u_c: 'ttcapitester', // pwd: TTCRules2019
			sesskey: 'vCFm-F6Aj-CzNS-2VRX-kMNN-Giks-FZpK-0',
			endpoint: 'https://timetonic.com/live/api.php',
			version: '5.89'
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
					assert.deepEqual(book.tables, expected);
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
				.then(() => book.getTableWithCode('test_code'))
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
				.then(() => book.getTableWithCode('test_code'))
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
				.then(() => book.getTableWithCode('test_code'))
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
				.then(() => book.getTableWithCode('test_code'))
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
	});
});