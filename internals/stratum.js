'use strict';

const net = require('net');

const util = require('./util.js');
const { diff1, Template } = require('./primitives.js');

class Counter {
    #seed = null;
    #counter = 0;

    constructor() {
        this.#seed = [util.randomBytes(8), util.packInt64LE(process.pid)];
    }

    next(len = 16) {
        return this.nextBin(len).toString('hex');
    }

    nextBin(len = 8) {
        let hash = util.sha256d(Buffer.concat([
            this.#seed[0],
            this.#seed[1],
            util.packInt64LE(this.#counter++)
        ]));

        return hash.slice(0, len);
    }
}

class StratumServer {
    #server = null;
    #shareTarget = diff1;
    #templates = [];

    constructor(options, initcb) {
        if ((options.extraNonce1Len >= Template.extraNonceLen))
            throw 'Invalid extranonce size';
        this.#server = net.createServer(this.handleConnection);
        this.#server.miners = {};
        this.#server.port = options.port;
        this.#server.counter = new Counter();
        this.#server.extraNonce1Len = options.extraNonce1Len;
        this.#server.extraNonce2Len = Template.extraNonceLen - options.extraNonce1Len;
        this.#server.stratum = this;

        if (options.shareTarget) {
            this.#shareTarget = options.shareTarget;
        }
    }

    start(initcb) {
        if (!this.#server.listening) {
            this.#server.listen(this.#server.port, error => {
                if (error) {
                    console.error("Unable to start server on: " + this.#server.port + " Message: " + error);
                    return;
                }
                initcb();
                console.log("Started server on port: " + this.#server.port);
            });
        }
    }

    pushJob(data, recipient) {
        let cleanjobs = this.#templates.length && 
            (this.#templates[this.#templates.length - 1].template.previousblockhash != data.previousblockhash);
        if (cleanjobs) {
            this.#templates.length = 0;
        }

        let jobid = this.#server.counter.next(4);
        let template = new Template(data, recipient, this.#server.counter.nextBin(8));
        this.#templates.push({ jobid: jobid, template: template });

        if (Object.keys(this.#server.miners).length != 0) {
            let job = template.getJobParams(jobid, cleanjobs);
            console.log('Worker', process.pid, 'is broadcasting job', jobid, 'to', Object.values(this.#server.miners).length, 'miners');
            Object.values(this.#server.miners).forEach(miner => {
                if (miner.authorized) {
                    // Broadcast jobs to authorized miners
                    StratumServer.notify(miner, 'mining.notify', job);
                }
            });
        }
    }

    sendjob(miner, cleanjobs = false) {
        let { jobid, template } = this.#templates[this.#templates.length - 1];
        let job = template.getJobParams(jobid, cleanjobs);
        StratumServer.notify(miner, 'mining.notify', job);
    }

    handleMessage(miner, message) {
        if (!('id' in message && 'method' in message && 'params' in message)) {
            console.warn('Malformed stratum request from ' + miner.remoteAddress);
            miner.destroy();
            return;
        }

        switch (message.method) {
            case 'mining.subscribe': {
                let [version, subscription] = message.params;
                if (subscription) {
                    // TODO: resume subscription
                }
                miner.subscribed = true;
                StratumServer.reply(miner, message.id, null, [
                    [
                        ["mining.set_difficulty", miner.subscriptionId],
                        ["mining.notify", miner.subscriptionId]
                    ],
                    miner.extraNonce1,
                    miner.server.extraNonce2Len
                ]);
            }; break;
            case 'mining.authorize': {
                if (!miner.subscribed)
                    return StratumServer.reply(miner, message.id, 'You are not eligible to do such requests', null);
                let [user, password] = message.params;
                miner.authorized = true;
                StratumServer.reply(miner, message.id, null, true);
                StratumServer.notify(miner, 'mining.set_difficulty', [Number(diff1 / this.#shareTarget)]);
                if (this.#templates.length) {
                    miner.server.stratum.sendjob(miner, true);
                }
            }; break;
            case 'mining.get_transactions': {
                if (!miner.subscribed || !miner.authorized)
                    return StratumServer.reply(miner, message.id, 'You are not eligible to do such requests', null);
                let topJob = this.#templates[this.#templates.length - 1];
                if (!topJob)
                    return StratumServer.reply(miner, message.id, 'No job records in work log, please try again later', null);
                StratumServer.reply(miner, message.id, null, topJob.template.data);
            }; break;
            case 'mining.submit': {
                if (!miner.authorized)
                    return StratumServer.reply(miner, message.id, 'You are not eligible to do such requests', null);
                const [user, jobid, extraNonce2, time, nonce] = message.params;
                const job = this.#templates.find(item => item.jobid == jobid);
                if (!job) {
                    return StratumServer.reply(miner, message.id, 'Job not found', false);
                }

                // New block header
                const header = job.template.serializeBlockHeader(miner.extraNonce1, extraNonce2, time, nonce);

                if (job.template.target >= header.hashVal) {
                    // New block was found
                    const block = job.template.serializeBlock(miner.extraNonce1, extraNonce2, time, nonce);

                    process.send({
                        sender: process.pid,
                        what: 'block',
                        data: {
                            coinbase: block.header.coinbase.toString('hex'),
                            header: block.header.hex,
                            hashBytes: Buffer.from(block.header.hashBytes).reverse().toString('hex'),
                            result: block.hex,
                            difficulty: Number(diff1 / block.header.hashVal),
                            needle: [
                                user,
                                miner.extraNonce1,
                                extraNonce2.toString('hex'),
                                time,
                                nonce,
                                job.template.randomId.toString('hex')
                            ]
                        }
                    });
                }
                else if (this.#shareTarget >= header.hashVal) {
                    // Report sub-target hash
                    process.send({
                        sender: process.pid,
                        what: 'share',
                        data: {
                            hashBytes: Buffer.from(header.hashBytes).reverse().toString('hex'),
                            difficulty: Number(diff1 / header.hashVal),
                            needle: [
                                user,
                                miner.extraNonce1,
                                extraNonce2,
                                time,
                                nonce,
                                job.template.randomId.toString('hex')
                            ]
                        }
                    });
                } else {
                    // Hash is neither block nor sub-target solution, just a garbage
                    return StratumServer.reply(miner, message.id, 'high-hash', null);
                }

                // Successful solution verification
                StratumServer.reply(miner, message.id, null, true);
            }; break;
            default:
                StratumServer.reply(miner, message.id, 'Unknown stratum method', null);
        }
    }

    handleConnection(miner) {
        let subscriptionId = this.counter.next();
        miner.setKeepAlive(true);
        miner.setEncoding('utf8');
        miner.subscribed = miner.authorized = false;
        miner.extraNonce1 = this.counter.next(this.extraNonce1Len);
        miner.subscriptionId = subscriptionId;
        this.miners[subscriptionId] = miner;

        console.log('Client', miner.remoteAddress, 'reserves subscriptionId', miner.subscriptionId);

        let dataBuffer = '';

        miner.on('data', function (d) {
            dataBuffer += d;
            if (Buffer.byteLength(dataBuffer, 'utf8') > 10240) { //10KB
                dataBuffer = null;
                console.warn('Excessive packet size from miner', miner.subscriptionId);
                miner.destroy();
                return;
            }
            if (dataBuffer.indexOf('\n') !== -1) {
                let messages = dataBuffer.split('\n');
                let incomplete = dataBuffer.slice(-1) === '\n' ? '' : messages.pop();
                for (let i = 0; i < messages.length; i++) {
                    let message = messages[i];
                    if (message.trim() === '') {
                        continue;
                    }
                    let jsonData;
                    try {
                        jsonData = JSON.parse(message);
                    }
                    catch (e) {
                        console.warn("Malformed message from miner", miner.subscriptionId);
                        miner.destroy();
                        break;
                    }
                    this.server.stratum.handleMessage(miner, jsonData);
                }
                dataBuffer = incomplete;
            }
        }).on('error', err => {
            if (err.code !== 'ECONNRESET' && 'subscriptionId' in miner) {
                console.warn("Socket Error from", miner.subscriptionId, "Error:", err);
            }
        }).on('close', () => {
            console.log('Freeing sunscriptionId', subscriptionId);
            delete this.miners[subscriptionId];
        });
    }

    static notify(miner, method, params) {
        if (!miner.writable) {
            return;
        }
        let sendData = JSON.stringify({
            id: null,
            method: method,
            params: params
        }) + "\n";
        miner.write(sendData);
    }

    static reply(miner, id, error, result) {
        if (!miner.writable) {
            return;
        }
        let sendData = JSON.stringify({
            id: id,
            error: error ? { code: -1, message: error } : null,
            result: !error ? result : null
        }) + "\n";
        miner.write(sendData);
    }
}

module.exports = StratumServer;
