var fs = require('fs');
var vm = require('vm');

var sandbox = {
	window: {},
	navigator: "Chrome",
	require: require,
	setTimeout: setTimeout,
	clearTimeout: clearTimeout,
	console:console,
};
var context = vm.createContext(sandbox);

var includeInThisContext = function(path) {
    var code = fs.readFileSync(path);
    vm.runInContext(code, context, path);
};

navigator = {};
navigator.userAgent = "Chrome";

//hack to get "browser JS" to run in NodeJS
includeInThisContext("crypto-js/core.js");
includeInThisContext("crypto-js/enc-base64.js");
includeInThisContext("crypto-js/cipher-core.js");
includeInThisContext("crypto-js/x64-core.js");
includeInThisContext("crypto-js/aes.js");
includeInThisContext("crypto-js/sha1.js");
includeInThisContext("crypto-js/sha256.js");
includeInThisContext("crypto-js/sha512.js");
includeInThisContext("crypto-js/hmac.js");
includeInThisContext("crypto-js/pad-nopadding.js");
includeInThisContext("crypto-js/mode-ctr.js");
includeInThisContext("salsa20.js");
includeInThisContext("cryptocatRandom.js");
includeInThisContext("multiparty.js");
includeInThisContext("catfacts.js");
includeInThisContext("bigint.js");
includeInThisContext("otr.js");
includeInThisContext("elliptic.js");

//Take out all the loaded things.
Cryptocat = context.Cryptocat;
DSA = context.DSA;
multiParty = context.multiParty;
OTR = context.OTR;

/* Configuration */
var defaultDomain = 'crypto.cat'; // Domain name to connect to for XMPP.
var defaultConferenceServer = 'conference.crypto.cat'; // Address of the XMPP MUC server.
var defaultBOSH = 'https://crypto.cat/http-bind'; // BOSH is served over an HTTPS proxy for better security and availability.
var fileSize = 700; // Maximum encrypted file sharing size, in kilobytes. Also needs to be defined in datareader.js
var localStorageOn = 0; // Disabling localStorage features until Firefox bug #795615 is fixed

/* Initialization */
var domain = defaultDomain;
var conferenceServer = defaultConferenceServer;
var xmppServer = "crypto.cat";
var xmppPort = 5222;
var bosh = defaultBOSH;
var otrKeys = {};
var conversations = {};
var loginCredentials = [];
var currentConversation = 0;
var audioNotifications = 0;
var desktopNotifications = 0;
var buddyNotifications = 0;
var loginError = 0;
var currentStatus = 'online';
var soundEmbed = null;
var conn, conversationName, myNickname, myKey;

// Seed RNG
Cryptocat.setSeed(Cryptocat.generateSeed());

// Create key
multiParty.genPrivateKey();
multiParty.genPublicKey();

console.log("Generating key...");
myKey = new DSA();
DSA.inherit(myKey);

conversationName = "test";
myNickname = "test";
user = Cryptocat.randomString(256, 1, 1, 1, 0);
password = Cryptocat.randomString(256, 1, 1, 1, 0);

// Clean nickname so that it's safe to use.
function cleanNickname(nickname) {
	var clean;
	if (clean = nickname.match(/\/([\s\S]+)/)) {
		clean = clean[1];
	}
	else {
		return false;
	}
	if (clean.match(/\W/)) {
		return false;
	}
	return clean;
}


// Build new buddy
function addBuddy(nickname) {
	var sendPublicKey = multiParty.sendPublicKey(nickname);
	cl.send(new xmpp.Element('message', { to: conversationName + "@" + conferenceServer, type: 'groupchat' }).
		c('body').t(sendPublicKey)
	);

	console.log(nickname + " joined.");
}

// Handle buddy going offline
function removeBuddy(nickname) {
	// Delete their encryption keys
	delete otrKeys[nickname];
	multiParty.removeKeys(nickname);
	console.log(nickname + " left.");
}

// OTR functions
// Handle incoming messages
var uicb = function(buddy) {
	return function(error, message) {
		if (error) {
			return console.log('OTR error: ' + error);
		}
		else
			console.log("OTR receive: "+buddy+ " " + message);
	}
}

// Handle outgoing messages
var iocb = function(buddy) {
	return function(message) {
		cl.send(new xmpp.Element('message', { to: conversationName + "@" + conferenceServer + "/" + buddy, type: 'chat' }).
			c('body').t(message)
		);
	}
}

var send = function(message)
{
	cl.send(new xmpp.Element('message', { to: conversationName + "@" + conferenceServer, type: 'groupchat' }).
		c('body').t(message)
	);
}

//=================
// CONNECT TO XMPP

var cl = new xmpp.Client({ 
		jid: user+"@"+domain,
		password: password,
		host: xmppServer,
		port: xmppPort,
		register: true,
});

cl.on('online',	function()
{
	console.log("CONNECTED!!");
	cl.send(new xmpp.Element('presence', { }).
		c('show').t('chat'));
	cl.send(new xmpp.Element('presence', { to: conversationName + "@" + conferenceServer + '/' + myNickname }).
		c('x', { xmlns: 'http://jabber.org/protocol/muc' }));
});

var Cleverbot = require("./cleverbot.js");
var bot = new Cleverbot();

cl.on('stanza',	function(stanza)
{
	if (stanza.attrs.type == 'error') {
		console.log('[error] ' + stanza);
		console.log(" ");
		return;
	}

	if(stanza.is("presence"))
	{
		// Ignore if presence status is coming from myself
		var nickname = cleanNickname(stanza.attrs.from);
		if(nickname == myNickname) return;
		
		var type = stanza.attrs.type;

		// Detect nickname change (which may be done by non-Cryptocat XMPP clients)
/*		if ($(presence).find('status').attr('code') === '303') {
			var newNickname = cleanNickname('/' + $(presence).find('item').attr('nick'));
			console.log(nickname + ' changed nick to ' + newNickname);
			changeNickname(nickname, newNickname);
			return true;
		}*/
		// Add to otrKeys if necessary
		if (nickname !== 'main-Conversation' && !otrKeys.hasOwnProperty(nickname)) {
			// var options = {
			// 	fragment_size: 8192,
			// 	send_interval: 400,
			// }
			otrKeys[nickname] = new OTR(myKey, uicb(nickname), iocb(nickname));
			otrKeys[nickname].REQUIRE_ENCRYPTION = true;
		}
		// Detect buddy going offline
		if (type === 'unavailable') {
			removeBuddy(nickname);
			return true;
		}
		// Create buddy element if buddy is new
		else {
			addBuddy(nickname);
		}

	}
	else if(stanza.is('message') && stanza.attrs.type == 'groupchat')
	{
		// ignore messages we sent
		if (stanza.attrs.from == conversationName + "@" + conferenceServer + '/' + myNickname)
			return;
	
		var body = stanza.getChild('body');
		if (!body) return;

		var message = body.getText().replace(/\&quot;/g, '"');
		var nickname = cleanNickname(stanza.attrs.from);
		var type = stanza.attrs.type;
	
		body = multiParty.receiveMessage(nickname, myNickname, message);

		if (typeof(body) === 'string')
		{
			console.log("RECEIVED: "+nickname+" "+body);
			bot.write(body, function(msg) {
				send(multiParty.sendMessage(msg.message));
			});
		}
	}	
	else if(stanza.is('message') && stanza.attrs.type == 'chat')
	{
		// ignore messages we sent
		if (stanza.attrs.from == conversationName + "@" + conferenceServer + '/' + myNickname)
			return;
	
		var body = stanza.getChild('body');
		if (!body) return;

		var message = body.getText().replace(/\&quot;/g, '"');
		var nickname = cleanNickname(stanza.attrs.from);
		var type = stanza.attrs.type;
	
		otrKeys[nickname].receiveMsg(message);
	}	
});
	
cl.on('error',function(e) {
	console.error(e);
});
	

