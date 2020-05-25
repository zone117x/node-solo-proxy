'use strict';

const rpcApi = require('./jsonrpc.js');
const { RpcConf } = require('../config.js');
const util = require('./util');

class Upstream {
    #client = null;

    constructor() {
        this.#client = new rpcApi(RpcConf);
    }

    getMiningInfo() {
        return new Promise((resolve, reject) => {
            this.#client.call({
                method: 'getmininginfo',
                params: []
            }, (error, data) => {
                if (error) return reject(error);
                return resolve(data.result);
            });
        });
    }

    getTemplate() {
        const gbtParams = [{"rules": ["segwit"]}];
        return new Promise((resolve, reject) => {
            this.#client.call({
                method: 'getblocktemplate',
                params: gbtParams
            }, (error, data) => {
                if (error) return reject(error);
                return resolve(data.result);
            });
        });
    }

    longPoll(lpId) {
        const gbtParamsLP = [{"rules": ["segwit"], "longpollid": lpId}];
        return new Promise((resolve, reject) => {
            this.#client.call({
                method: 'getblocktemplate',
                params: gbtParamsLP
            }, (error, data) => {
                if (error) return reject(error);
                return resolve(data.result);
            });
        });
    }

    getTemplateDGB() {
        const gbtParams = [{"rules": ["segwit"]}, 'sha256d'];
        return new Promise((resolve, reject) => {
            this.#client.call({
                method: 'getblocktemplate',
                params: gbtParams
            }, (error, data) => {
                if (error) return reject(error);
                return resolve(data.result);
            });
        });
    }

    longPollDGB(lpId) {
        const gbtParamsLP = [{"rules": ["segwit"], "longpollid": lpId}, 'sha256d'];
        return new Promise((resolve, reject) => {
            this.#client.call({
                method: 'getblocktemplate',
                params: gbtParamsLP
            }, (error, data) => {
                if (error) return reject(error);
                return resolve(data.result);
            });
        });
    }

    propose(data) {
        return new Promise((resolve, reject) => {
            this.#client.call({
                method: 'getblocktemplate',
                params: [ { mode : "proposal", rules : ["segwit"], data : data.toString('hex')} ]
            }, (error, data) => {
                if (error) return reject(error);
                return resolve(data.result);
            });
        });
    }

    submit(data) {
        return new Promise((resolve, reject) => {
            this.#client.call({
                method: 'submitblock',
                params: [ data.toString('hex') ]
            }, (error, data) => {
                if (error) return reject(error);
                return resolve(data.result);
            });
        });
    }
}


module.exports = Upstream;
