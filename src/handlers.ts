import {
    Article,
    Follow,
    RequestContext,
    lookupObject,
    isActor,
    Create,
    Note,
    Update,
    PUBLIC_COLLECTION
} from '@fedify/fedify';
import { Context, Next } from 'hono';
import sanitizeHtml from 'sanitize-html';
import { v4 as uuidv4 } from 'uuid';
import { addToList } from './kv-helpers';
import { toURL } from './toURL';
import { ContextData, HonoContextVariables, fedify } from './app';
import { getSiteSettings } from './ghost';
import type { PersonData } from './user';
import { ACTOR_DEFAULT_HANDLE } from './constants';

type StoredThing = {
    object: string | {
        content: string;
    }
}

async function postToArticle(ctx: RequestContext<ContextData>, post: any) {
    if (!post) {
        return {
            article: null,
            preview: null,
        };
    }
    const preview = new Note({
        id: ctx.getObjectUri(Note, { id: post.uuid }),
        content: post.excerpt,
    });
    const article = new Article({
        id: ctx.getObjectUri(Article, { id: post.uuid }),
        name: post.title,
        content: post.html,
        image: toURL(post.feature_image),
        published: post.published_at,
        preview: preview,
        url: toURL(post.url),
    });

    return {
        article,
        preview,
    };
}

export async function followAction(
    ctx: Context<{ Variables: HonoContextVariables }>,
) {
    const handle = ctx.req.param('handle');
    const actorToFollow = await lookupObject(handle);
    if (!isActor(actorToFollow)) {
        // Not Found?
        return;
    }
    const apCtx = fedify.createContext(ctx.req.raw as Request, {
        db: ctx.get('db'),
        globaldb: ctx.get('globaldb'),
    });
    const actor = await apCtx.getActor(ACTOR_DEFAULT_HANDLE); // TODO This should be the actor making the request
    const followId = apCtx.getObjectUri(Follow, {
        id: uuidv4(),
    });
    const follow = new Follow({
        id: followId,
        actor: actor,
        object: actorToFollow,
    });
    const followJson = await follow.toJsonLd();
    ctx.get('globaldb').set([follow.id!.href], followJson);

    apCtx.sendActivity({ handle: ACTOR_DEFAULT_HANDLE }, actorToFollow, follow);
    return new Response(JSON.stringify(followJson), {
        headers: {
            'Content-Type': 'application/activity+json',
        },
        status: 200,
    });
}

export async function postPublishedWebhook(
    ctx: Context<{ Variables: HonoContextVariables }>,
    next: Next,
) {
    // TODO: Validate webhook with secret
    const data = await ctx.req.json();
    const apCtx = fedify.createContext(ctx.req.raw as Request, {
        db: ctx.get('db'),
        globaldb: ctx.get('globaldb'),
    });
    const { article, preview } = await postToArticle(
        apCtx,
        data?.post?.current,
    );
    if (article) {
        const actor = await apCtx.getActor(ACTOR_DEFAULT_HANDLE);
        const create = new Create({
            actor,
            object: article,
            id: apCtx.getObjectUri(Create, { id: uuidv4() }),
            to: PUBLIC_COLLECTION,
            cc: apCtx.getFollowersUri('index'),
        });
        try {
            await article.toJsonLd();
            await ctx
                .get('globaldb')
                .set([preview.id!.href], await preview.toJsonLd());
            await ctx
                .get('globaldb')
                .set([create.id!.href], await create.toJsonLd());
            await ctx
                .get('globaldb')
                .set([article.id!.href], await article.toJsonLd());
            await addToList(ctx.get('db'), ['outbox'], create.id!.href);
            await apCtx.sendActivity({ handle: ACTOR_DEFAULT_HANDLE }, 'followers', create, {
                preferSharedInbox: true
            });
        } catch (err) {
            console.log(err);
        }
    }
    return new Response(JSON.stringify({}), {
        headers: {
            'Content-Type': 'application/activity+json',
        },
        status: 200,
    });
}

export async function siteChangedWebhook(
    ctx: Context<{ Variables: HonoContextVariables }>,
    next: Next,
) {
    try {
        // Retrieve site settings from Ghost
        const host = ctx.req.header('host') || '';

        const settings = await getSiteSettings(host);

        // Update the database
        const handle = ACTOR_DEFAULT_HANDLE;
        const db = ctx.get('db');

        const current = await db.get<PersonData>(['handle', handle]);
        const updated =  {
            ...current,
            icon: settings.site.icon,
            name: settings.site.title,
            summary: settings.site.description,
        }

        await db.set(['handle', handle], updated);

        // Publish activity
        const apCtx = fedify.createContext(ctx.req.raw as Request, {
            db,
            globaldb: ctx.get('globaldb'),
        });

        const actor = await apCtx.getActor(handle);

        const update = new Update({
            id: apCtx.getObjectUri(Update, { id: uuidv4() }),
            actor: actor?.id,
            to: PUBLIC_COLLECTION,
            object: actor,
            cc: apCtx.getFollowersUri('index'),
        });

        await ctx.get('globaldb').set([update.id!.href], await update.toJsonLd());
        await addToList(db, ['outbox'], update.id!.href);
        await apCtx.sendActivity({ handle }, 'followers', update, {
            preferSharedInbox: true
        });
    } catch (err) {
        console.log(err);
    }

    // Return 200 OK
    return new Response(JSON.stringify({}), {
        headers: {
            'Content-Type': 'application/activity+json',
        },
        status: 200,
    });
}

export async function inboxHandler(
    ctx: Context<{ Variables: HonoContextVariables }>,
    next: Next,
) {
    const results = (await ctx.get('db').get<string[]>(['inbox'])) || [];
    let items: unknown[] = [];
    for (const result of results) {
        try {
            const db = ctx.get('globaldb');
            const thing = await db.get<StoredThing>([result]);

            // If the object is a string, it's probably a URI, so we should
            // look it up the db. If it's not in the db, we should just leave
            // it as is
            if (thing && typeof thing.object === 'string') {
                thing.object = await db.get([thing.object]) ?? thing.object;
            }

            // Sanitize HTML content
            if (thing?.object && typeof thing.object !== 'string') {
                thing.object.content = sanitizeHtml(thing.object.content, {
                    allowedTags: ['a', 'p', 'img', 'br', 'strong', 'em', 'span'],
                    allowedAttributes: {
                        a: ['href'],
                        img: ['src'],
                    }
                });
            }

            items.push(thing);
        } catch (err) {
            console.log(err);
        }
    }
    return new Response(
        JSON.stringify({
            '@context': 'https://www.w3.org/ns/activitystreams',
            type: 'OrderedCollection',
            totalItems: results.length,
            items,
        }),
        {
            headers: {
                'Content-Type': 'application/activity+json',
            },
            status: 200,
        },
    );
}
