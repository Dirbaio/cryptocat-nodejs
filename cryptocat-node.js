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
//includeInThisContext("strophe/strophe.js");
//context.Strophe = context.window.Strophe;
//includeInThisContext("strophe/strophe.register.js");
//includeInThisContext("strophe/strophe.muc.js");

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
//includeInThisContext("cryptocat.js");

//Take out all the loaded things.
Strophe = context.Strophe;
Cryptocat = context.Cryptocat;
Language = context.Language;
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


var xmpp = require('node-xmpp');
var muc = require('./node-xmpp-muc');
var argv = process.argv;

     
// Seed RNG
Cryptocat.setSeed(Cryptocat.generateSeed());
// Create key
multiParty.genPrivateKey();
multiParty.genPublicKey();

console.log("Generating key...");
myKey = new DSA();
DSA.inherit(myKey);

conversationName = "bot";
myNickname = "bot";
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
	

// Logs into the XMPP server, creating main connection/disconnection handlers.
function login(username, password) {
	conn = new Strophe.Connection(bosh);
	conn.connect(username + '@' + domain, password, function(status) {
		if (status === Strophe.Status.CONNECTING) {
			console.log("Connecting...");
		}
		else if (status === Strophe.Status.CONNFAIL) {
			console.log("Login error...");
		}
		else if (status === Strophe.Status.CONNECTED) {
			conn.muc.join(
				conversationName + '@' + conferenceServer, myNickname, 
				function(message) {
					if (	(message)) {
						return true;
					}
				},
				function (presence) {
					if (handlePresence(presence)) {
						return true;
					}
				}
			);
			if (localStorageOn) {
				localStorage.setItem('myNickname', myNickname);
			}

			console.log("Connected!");

/*			$('#buddy-main-Conversation').attr('status', 'online');
			$('#loginInfo').text('✓');
			$('#loginInfo').animate({'color': '#97CEEC'}, 'fast');
			$('#bubble').animate({'margin-top': '+=0.5%'}, function() {
				$('#bubble').animate({'margin-top': '0'}, function() {
					$('#loginLinks').fadeOut();
					$('#info').fadeOut();
					$('#version').fadeOut();
					$('#options').fadeOut();
					$('#loginForm').fadeOut();
					$('#bubble').animate({'width': '100%'})
					.animate({'height': $(window).height()}, 'slow', function() {
						$(this).animate({'margin': '0', 'border-radius': '0'}, 'slow');
						$('.button').fadeIn();
						$('#buddyWrapper').fadeIn('fast', function() {
							$('#conversationInfo').animate({'width': $(window).width()}, function() {
								$(window).resize();
							});
							var scrollWidth = document.getElementById('buddyList').scrollWidth;
							$('#buddyList').css('width', (150 + scrollWidth) + 'px');
							bindBuddyClick('main-Conversation');
							$('#buddy-main-Conversation').click();
							buddyNotifications = 1;
						});
					});
				});
			});*/
			loginError = 0;
		}
		else if (status === Strophe.Status.DISCONNECTED) {
			console.log("Disconnected.");
			otrKeys = {};
			multiParty.reset();
			conversations = {};
			loginCredentials = [];
			currentConversation = 0;
			conn = null;

/*			$('.button').fadeOut('fast');
			$('#conversationInfo').animate({'width': '0'});
			$('#conversationInfo').text('');
			$('#buddy-main-Conversation').attr('status', 'offline');
			$('#userInput').fadeOut(function() {
				$('#conversationWindow').slideUp(function() {
					$('#buddyWrapper').fadeOut();
					if (!loginError) {
						$('#loginInfo').animate({'color': '#999'}, 'fast');
						$('#loginInfo').text(Cryptocat.language['loginMessage']['thankYouUsing']);
					}
					$('#bubble').css({
						'border-radius': '12px 0 12px 12px',
						'margin': '0 auto'
					});
					$('#bubble').animate({
						'margin-top': '5%',
						'height': '310px'
					}).animate({'width': '680px'}, 'slow', function() {
						$('#buddyList div').each(function() {
							if ($(this).attr('id') !== 'buddy-main-Conversation') {
								$(this).remove();
							}
						});
						$('#conversationWindow').text('');
						otrKeys = {};
						multiParty.reset();
						conversations = {};
						loginCredentials = [];
						currentConversation = 0;
						conn = null;
						if (!loginError) {
							$('#conversationName').val(Cryptocat.language['loginWindow']['conversationName']);
						}
						$('#nickname').val(Cryptocat.language['loginWindow']['nickname']);
						$('#info').fadeIn();
						$('#loginLinks').fadeIn();
						$('#version').fadeIn();
						$('#options').fadeIn();
						$('#loginForm').fadeIn('fast', function() {
							$('#conversationName').select();
							$('#loginSubmit').removeAttr('readonly');
						});
					});
					$('.buddy').unbind('click');
					$('.buddyMenu').unbind('click');
					$('#buddy-main-Conversation').insertAfter('#buddiesOnline');
				});
			});*/
		}
		else if (status === Strophe.Status.AUTHFAIL) {
			console.log("Authentication failure!");
			conn = null;
		}
	});
}

