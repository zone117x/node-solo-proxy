#!/usr/bin/env node
'use strict';

const Upstream = require('./internals/upstream');
const { sleep } = require('./internals/util');
const { fork } = require('child_process');


function timestamp() {
    return new Date().toLocaleString();
}


(async () => {
    let upstream = new Upstream;

    try {
        // Check RPC
        console.log('Testing RPC connection...');
        const miningInfo = await upstream.getMiningInfo();
        console.log('RPC connection successful, block height %d mining difficulty %s', miningInfo.blocks, miningInfo.difficulty);
    } catch(e) {
        console.log('Error while testing upstream connection', e);
        process.exit(-1);
    }

    let tpl;
    let is_dgb;

    // Detect GBT param set
    try {
        console.log('Detecting required GBT parameter set...');
        try {
            await upstream.getTemplate();
            is_dgb = false;
            console.log('Detected bitcoin-like classic GBT');
        } catch(e) {
            await upstream.getTemplateDGB();
            is_dgb = true;
            console.log('Detected digibyte-like GBT');
        }
    } catch(e) {
        console.log('Unable to detect GBT params set', e);
        process.exit(-1);
    }

    // Start stratum workers
    const clients = fork('./stratum_workers.js');

    // Solution messages handler
    clients.on('message', async msg => {
        if (msg.what === 'share') {
            console.log(`_____GOT SHARE_____`, msg.data);
            let { coinbase, header, hashBytes, difficulty } = msg.data;
            let [user, extraNonce1, extraNonce2, time, nonce, randomId] = msg.data.needle;

            // Report solution info
            console.log('[%s] Got sub-target hash %s from %s with difficulty %s', timestamp(), hashBytes, user, difficulty);
            console.log('Solution data: ExtraNonce1 %s, ExtraNonce2 %s, time %s, nonce %s, randomId %s', extraNonce1, extraNonce2, time, nonce, randomId);
            console.log('Solution header hash: %s', hashBytes);
            console.log('[%s] solution is lower than block target, skipping submission', timestamp());
        }

        if (msg.what === 'block') {
            console.log(`_____GOT block______`, msg.data);
            let { result, coinbase, header, hashBytes, difficulty } = msg.data;
            let [user, extraNonce1, extraNonce2, time, nonce, randomId] = msg.data.needle;

            // Report solution info
            console.log('[%s] Got solution hash %s from %s with difficulty %s', timestamp(), hashBytes, user, difficulty);
            console.log('Solution data: ExtraNonce1 %s, ExtraNonce2 %s, time %s, nonce %s, randomId %s', extraNonce1, extraNonce2, time, nonce, randomId);
            console.log('Solution header hash: %s', hashBytes);
            console.log('Reconstructed coinbase %s', coinbase);
            console.log('Reconstructed block header %s', header);

            try {
                // Submitting block to upstream
                const res = await upstream.submit(result);
                if (res !== null)
                    return console.log('[%s] block solution with difficulty %s from %s has been rejected by bitcoind: %s', timestamp(), difficulty, user, res);
                console.log('[%s] block solution with difficulty %s from %s has been accepted by bitcoind', timestamp(), difficulty, user);
            } catch (e) {
                console.log('Error while sending solution to upstream', e);
                process.exit(-1);
            }
        }
    });

    // Work update loop
    try {
        while (true) {
            let newTpl;

            // Get new template
            if (is_dgb) {
                newTpl = (tpl === undefined) ? await upstream.getTemplateDGB() : await upstream.longPollDGB(tpl.longpollid);
            }
            else {
                newTpl = (tpl === undefined) ? await upstream.getTemplate() : await upstream.longPoll(tpl.longpollid);
            }

            if (tpl !== undefined && tpl.previousblockhash === newTpl.previousblockhash && tpl.default_witness_commitment === newTpl.default_witness_commitment) {
                // hack for sudden drop of longpoll requests
                await sleep(30000);
            }
            else {
                // Send new job to clients
                console.log('Got prevhash %s from upstream', newTpl.previousblockhash);
                clients.send({ sender: process.pid, what: 'newjob', data: newTpl });
            }

            // Update current template
            tpl = newTpl;
        }
    } catch(e) {
        console.log('Error while processing new job data', e);
        process.exit(-1);
    }

})();
