'use strict';

const { diff1 }  = require('./internals/primitives.js');

module.exports.RpcConf = {
    host: '127.0.0.1',
    port: 18332,
    user: 'rpcuser',
    password: 'rpcpassword'
};

module.exports.StratumConf = {
    port: 3334,
    extraNonce1Len: 4,
// default
//    shareTarget: diff1 / 16384n
// works, got one from cpuminer
//    shareTarget: diff1 / 1n
// nicehash min
    shareTarget: diff1 / 500000n
};

console.log(`__SHARE_TARGET:: ${module.exports.StratumConf.shareTarget.toString()}`);

// Recipient address
// module.exports.Recipient = 'bc1q4lcelq3cwexfydpl5zdlev5e';
module.exports.Recipient = 'tb1qc7sfev9vr5w5uqsft7rmy23s42yx50rac8ftrw';
// Node admin address
// module.exports.Admin = 'bc1q4lcelq3cwexfydpl5zdlev5e9sfhfl3wansn56';
module.exports.Admin = 'tb1qc7sfev9vr5w5uqsft7rmy23s42yx50rac8ftrw';
// 5% node fee
module.exports.AdminFee = 0.00;
// 2.5% developer donation
module.exports.Donation = 0.00;
