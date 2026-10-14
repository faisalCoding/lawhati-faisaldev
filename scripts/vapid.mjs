#!/usr/bin/env node
// Generates the key pair this server signs its push notifications with.
//
// The private half never leaves the server; the public half is handed to every
// browser that subscribes. Replacing the pair invalidates every subscription,
// so generate once and keep it.

import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const subject = process.argv[2] ?? 'https://faisaldev.site';

console.log(JSON.stringify({ subject, publicKey, privateKey }, null, 2));
console.error('\nPut this on the server as /etc/credstore/lawhati-faisaldev-vapid.json (chmod 600, root only),');
console.error('then: systemctl restart lawhati-faisaldev\n');
