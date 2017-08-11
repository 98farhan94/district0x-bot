var jp = require('jsonpath');
var moment = require('moment');
var numeral = require('numeral');
var request = require('request');
var async = require('async');


sup = [];  //supporters
dis = [];  //disapprove
suptotal = [];
distotal = 0;
ptotal = 0;



var mktChannel;

// !price {currency}
// !price {currency} {amount}
var command = '!stat';

module.exports={
    command: command,
    init: init,
    respond: respond
};

function init(channel_) {
    mktChannel = channel_;
    if (!channel_) {
        console.log('No market and trading channel. Statbot will only respond to DMs.');
    }
}

var globalSlackParams = {};

function respond(bot, data) {
    var channel = data.channel,
    words = data.text.trim().split(' ').filter( function(n){return n !== "";} );

    if (words[0] !== command || (channel != mktChannel && !channel.startsWith('D'))) {
        // if the received message isn't starting with the trigger,
        // or the channel is not the market-and-trading channel, nor sandbox, nor a DM -> ignore
        return;
    }
runner(bot,channel,sup,dis,suptotal,distotal);
/*fetchtx(bot,channel);
calctokens(sup,suptotal);
calctokens(dis,distotal); 
*/
}

function fetchtx(bot,channel) {
  //gets the data
  sup =[];
  dis = [];

  return new Promise(function (resolve, reject) {
var statsurl='http://api.etherscan.io/api?module=account&action=txlist&address=0x2643957A7fbb444755Ded8b3615fB54D648411eb&startblock=0&endblock=99999999&sort=asc&
=&page=1&offset=10';

    request.get(statsurl, function(error, response, body) {
        if (error) {
            bot.postMessage(channel, err.message ? err.message : 'The request could not be completed at this time. Please try again later.');
            return;
        }

        var address = 0;
        var id = 0;

       try {
                parsed = JSON.parse(body);

            } catch (ignored) {
                // invalid response or pair rate
            }

            var total = Object.keys(parsed.result).length;

            for (i=0 ; i<total; i++){
                address = parsed.result[i].from;
                id = parsed.result[i].input.substr(73, 1) ;
                if(id==1){
                    sup.push(address);
                     //bot.postMessage(channel, 'Support: '+address, {icon_emoji: ':lbr:'});
                }
                else{
                    dis.push(address);
                     //bot.postMessage(channel, 'Disapprove: '+address, {icon_emoji: ':lbr:'});
                }
            }
            bot.postMessage(channel, 'Support: '+sup.toString(), {icon_emoji: ':lbr:'});
            bot.postMessage(channel, 'Disapprove: '+dis.toString(), {icon_emoji: ':lbr:'});

         });
  })
}

function calctokens(bot,channel,sup) {
  //does some stuff with the data
   
  return new Promise(function (resolve, reject) {
    var m = Object.keys(sup).length;
    var d = 0;
    var tokenurl = 0;
    var z = 0;
    var mc = 0;
    var i = 0;
    var tokenurl = 0;
    x = 0;



var processItems = async function(x) {
  if(x < sup.length) {
    item = sup.pop();
    tokenurl='https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0x0abdace70d3790235af448c88547603b945604ea&address='+item+'&tag=latest&apikey=';

    try {
      const result = await request.get(tokenurl);
      const mc = JSON.parse(result);
      
      mc = mc.result * 0.000000000000000001;
      suptotal.push(mc);
      processItems(x+1);
    } catch(error) {
      bot.postMessage(channel, err.message ? err.message : 'The request could not be completed at this time. Please try again later.');
    }
  }
};

 bot.postMessage(channel, 'Total Balance Outside Loop: '+suptotal.toString(), {icon_emoji: ':lbr:'});
        

    //view(bot,channel,sup,dis,z,distotal);
    /*{
                    setTimeout(function(){
                                        bot.postMessage(channel, 'Total Balance Outside Loop: '+suptotal.toString(), {icon_emoji: ':lbr:'});
                                    },25000);
                                    } //bad hack to have it show after the loop*/

  })
}

//The function that orchestrates these calls 
function runner(bot,channel,sup,dis,suptotal,distotal) {
    return fetchtx(bot,channel)
        .then(calctokens(bot,channel,sup))
}

/*runner(bot,channel,sup,dis,suptotal,distotal).then(function (view(sup,dis,suptotal,distotal)) {
    console.log(sup,dis,suptotal,distotal);
})*/

function doHelp(bot, channel) {
    var message =
    '`' + command + '`: show the price of 1 DNT in ' + options.defaultCurrency + '\n' +
    '`' + command + ' help`: this message\n' +
    '`' + command + ' CURRENCY`: show the price of 1 DNT in CURRENCY. Supported values for CURRENCY are *btc* and *usd* (case-insensitive)\n' +
    '`' + command + ' CURRENCY AMOUNT`: show the price of AMOUNT DNT in CURRENCY\n';

    if (!channel.startsWith("D")) {
        message =
        '*USE PM FOR HELP*\n' +
        message +
        '\n' +
        '*Everyone will see what I say. Send me a Direct Message if you want to interact privately.*\n' +
        'If I\'m not responding in some channel, you can invite me by @mentioning me.\n';
    }

    bot.postMessage(channel, message, globalSlackParams);
}

function formaty(n, decimals, currency) {
    n = parseFloat(n);
    return currency + " " + n.toFixed(2).replace(/(\d)(?=(\d{3})+\.)/g, "$1,");
}

/*function print(bot,channel,sup,dis,suptotal,distotal){
     var statmsg = sup.toString() + '\n \n' + dis.toString() + '\n' + suptotal + '\n' + distotal;

                bot.postMessage(channel, statmsg, {icon_emoji: ':lbr:'});
  
}*/
