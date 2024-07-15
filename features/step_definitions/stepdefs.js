import assert from 'assert';
import { Given, When, Then } from '@cucumber/cucumber';

const activites = {
    Create: {
        '@context': [
            'https://www.w3.org/ns/activitystreams',
            'https://w3id.org/security/data-integrity/v1',
        ],
        'type': 'Create',
        'id': 'https://www.site.com/create/1',
        'to': 'as:Public',
        'cc': 'https://www.site.com/followers',
    },
};

const objects = {
    Article: {
        'type': 'Article',
        'id': 'https://www.site.com/article/1',
        'to': 'as:Public',
        'cc': 'https://www.site.com/followers',
        'url': 'https://www.site.com/article/1',
        'content': '<p>This is a test article</p>',
        'published': '2020-04-20T04:20:00Z',
        'attributedTo': 'https://site.com/user'
    },
    Note: {
        'type': 'Note',
        'id': 'https://www.site.com/note/1',
        'to': 'as:Public',
        'cc': 'https://www.site.com/followers',
        'url': 'https://www.site.com/note/1',
        'content': '<p>This is a test note</p>',
        'published': '2020-04-20T04:20:00Z',
        'attributedTo': 'https://site.com/user'
    }
};

const actors = {
    known: {
        'id': 'https://site.com/user',
        'url': 'https://site.com/user',
        'name': 'Test Actor',
        'type': 'Person',
        'inbox': 'https://site.com/inbox',
        'outbox': 'https://site.com/outbox',
        'summary': 'A test actor for testing',
        'followers': 'https://site.com/followers',
        'following': 'https://site.com/following',
        'published': '2024-02-21T00:00:00Z',
        'preferredUsername': 'index',
        'as:manuallyApprovesFollowers': false,
        'https://w3id.org/security#publicKey': {
            'id': 'https://www.site.com/user#main-key',
            'type': 'https://w3id.org/security#Key',
            'https://w3id.org/security#owner': {
                'id': 'https://site.com/user'
            },
            'https://w3id.org/security#publicKeyPem': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtSc3IqGjRaO3vcFdQ15D\nF90WVJC6tb2QwYBh9kQYVlQ1VhBiF6E4GK2okvyvukIL5PHLCgfQrfJmSiopk9Xo\n46Qri6rJbcPoWoZz/jWN0pfmU20hNuTQx6ebSoSkg6rHv1MKuy5LmDGLFC2ze3kU\nsY8u7X6TOBrifs/N+goLaH3+SkT2hZDKWJrmDyHzj043KLvXs/eiyu50M+ERoSlg\n70uO7QAXQFuLMILdy0UNJFM4xjlK6q4Jfbm4MC8QRG+i31AkmNvpY9JqCLqu0mGD\nBrdfJeN8PN+7DHW/Pzspf5RlJtlvBx1dS8Bxo2xteUyLGIaTZ9HZFhHc3IrmmKeW\naQIDAQAB\n-----END PUBLIC KEY-----\n'
        }
    },
    unknown: {
        'id': 'https://site.com/user',
        'url': 'https://site.com/user',
        'name': 'Test Actor',
        'type': 'Person',
        'inbox': 'https://site.com/inbox',
        'outbox': 'https://site.com/outbox',
        'summary': 'A test actor for testing',
        'followers': 'https://site.com/followers',
        'following': 'https://site.com/following',
        'published': '2024-02-21T00:00:00Z',
        'preferredUsername': 'index',
        'as:manuallyApprovesFollowers': false,
        'https://w3id.org/security#publicKey': {
            'id': 'https://www.site.com/user#main-key',
            'type': 'https://w3id.org/security#Key',
            'https://w3id.org/security#owner': {
                'id': 'https://site.com/user'
            },
            'https://w3id.org/security#publicKeyPem': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtSc3IqGjRaO3vcFdQ15D\nF90WVJC6tb2QwYBh9kQYVlQ1VhBiF6E4GK2okvyvukIL5PHLCgfQrfJmSiopk9Xo\n46Qri6rJbcPoWoZz/jWN0pfmU20hNuTQx6ebSoSkg6rHv1MKuy5LmDGLFC2ze3kU\nsY8u7X6TOBrifs/N+goLaH3+SkT2hZDKWJrmDyHzj043KLvXs/eiyu50M+ERoSlg\n70uO7QAXQFuLMILdy0UNJFM4xjlK6q4Jfbm4MC8QRG+i31AkmNvpY9JqCLqu0mGD\nBrdfJeN8PN+7DHW/Pzspf5RlJtlvBx1dS8Bxo2xteUyLGIaTZ9HZFhHc3IrmmKeW\naQIDAQAB\n-----END PUBLIC KEY-----\n'
        }
    },
};

Given('a valid {string} activity', function (string) {
    const [match, activity, object] = string.match(/(\w+)\((\w+)\)/) || [null]
    if (!match) {
        throw new Error(`Could not match ${string} to an activity`);
    }
    this.activity = activity;
    this.object = object;
    this.actor = 'known';
});

Given('the actor is {string}', function (string) {
    this.actor = string;
});

When('it is sent to the Inbox', async function () {
    if (!this.activity || !this.object || !this.actor) {
        throw new Error(`Incomplete information for activity`);
    }
    const activity = activites[this.activity];
    const object = objects[this.object];
    const actor = actors[this.actor];

    const payload = {
        ...activity,
        ...{object},
        ...{actor},
    };

    try {
        this.response = await fetch('http://activitypub:8080/.ghost/activitypub/inbox/index', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/ld+json'
            },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.log(err);
    }
});

Then('the request is rejected', function () {
    assert(!this.response.ok);
});

Then('the request is accepted', function () {
    assert(this.response.ok);
});

Then('the activity is in the Inbox', async function () {
    const response = await fetch('http://activitypub:8080/.ghost/activitypub/inbox/index', {
        headers: {
            Accept: 'application/ld+json'
        }
    });
    const inbox = await response.json();
    console.log(inbox);
});
