import * as http from 'http';
import { EventEmitter } from 'events';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as bodyParser from 'koa-bodyparser';
import * as request from 'request';
import crypto = require('crypto');

const config = require('../config.json');

const handler = new EventEmitter();

const post = async (text: string, home = true) => {
	request.post(config.instance + '/api/notes/create', {
		json: {
			i: config.i,
			text,
			visibility: home ? 'home' : 'public',
			noExtractMentions: true,
			noExtractHashtags: true,
			localOnly: true
		}
	});
};

const app = new Koa();
app.use(bodyParser());

const secret = config.hookSecret;

const router = new Router();

router.post('/github', ctx => {
	const body = JSON.stringify(ctx.request.body);
	const hash = crypto.createHmac('sha1', secret).update(body).digest('hex');
	const sig1 = Buffer.from(ctx.headers['x-hub-signature']);
	const sig2 = Buffer.from(`sha1=${hash}`);

	// シグネチャ比較
	if (sig1.equals(sig2)) {
		let ghHeader = ctx.headers['x-github-event'] as string;
		handler.emit(ghHeader, ctx.request.body);
		ctx.status = 204;
	} else {
		ctx.status = 400;
	}
});

app.use(router.routes());

const server = http.createServer(app.callback());

server.listen(config.port);

handler.on('push', event => {
	const ref = event.ref;
	switch (ref) {
		case 'refs/heads/develop':
			const pusher = event.pusher;
			const compare = event.compare;
			const commits: any[] = event.commits;
			post([
				`🆕 Pushed by **${pusher.name}** with ?[${commits.length} commit${commits.length > 1 ? 's' : ''}](${compare}):`,
				commits.reverse().map(commit => `・[?[${commit.id.substr(0, 7)}](${commit.url})] ${commit.message.split('\n')[0]}`).join('\n'),
			].join('\n'));
			break;
	}
});

handler.on('release', event => {
	const action = event.action;
	const release = event.release;
	let text: string;
	switch (action) {
		case 'published': text = `🎁 **NEW RELEASE**: [${release.tag_name}](${release.html_url}) is out. Enjoy!`; break;
		default: return;
	}
	post(text);
});

console.log("🚀 Ready! 🚀")
