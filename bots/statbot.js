var jp = require('jsonpath');
var moment = require('moment');
var numeral = require('numeral');
var request = require('request');

var options = {
    defaultCurrency: 'USD',

    // supported currencies and api steps to arrive at the final value
    currencies: {
        USD: { steps: ['DNTBTC', 'BTCUSD'], format: '$0,0.00', sign:'$' },
        BTC: { steps: ['DNTBTC',], format: 'BTC 0,0.00000000', sign:'BTC' },
        ETH: { steps: ['DNTETH',], format: 'ETH 0,0.00000000', sign: 'ETH' },
        GBP: { steps: ['DNTBTC', 'BTCGBP'], format: '£0,0.00', sign: '£' }
    },

    // api steps
    api: {
        DNTBTC: { url: 'https://api.coinmarketcap.com/v1/ticker/district0x/', path: '$[0].price_btc' },
        BTCUSD: { url: 'https://blockchain.info/ticker', path: '$.USD.buy' },
        BTCGBP: { url: 'https://blockchain.info/ticker', path: '$.GBP.buy' },
        DNTETH: { url: 'https://api.coinmarketcap.com/v1/ticker/district0x/?convert=eth', path: '$[0].price_eth' }
    },

    // display date/time format
    dtFormat: 'Do MMM YYYY h:mma [UTC]',

    // refresh rate in milliseconds to retrieve a new price (default to 10 minutes)
    refreshTime: 120000 //1 min
};

// store the last retrieved rate
var cachedRates = {};

var mktChannel;

// !price {currency}
// !price {currency} {amount}
var command = '!stats';

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

    var currencies = Object.keys(options.currencies);
    for (var i = 0; i < currencies.length; i++) {
        cachedRates[currencies[i]] = { rate: 0, time: null };
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

    var currency = /*(words.length > 1) ? words[2].toUpperCase() :*/  options.defaultCurrency;
    var amount = /*(words.length > 2) ? parseFloat(words[2], 10) :*/ 1;
    var showHelp = (isNaN(amount)) || (Object.keys(options.currencies).indexOf(currency) === -1);

    var moveToBotSandbox = showHelp && channel !== mktChannel && !channel.startsWith("D");
    if (moveToBotSandbox) {
        bot.postMessage(channel, 'Please use PM to talk to bot.', globalSlackParams);
        return;
    }

    if (showHelp) {
        doHelp(bot, channel);
    } else {
        bnb(bot, channel);
        doSteps(bot, channel, 'ETH', amount);
        doSteps(bot, channel, 'USD', amount);
        doSteps(bot, channel, 'BTC', amount);
        setTimeout(function() { marketstats(bot,channel); }, 250);

        //marketstats(bot,channel);
        //volume24(bot,channel); can't get this part to work, someone help me fix - i think it's because 24h_volume_usd starts with number
    }
}

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

function formatMessage(amount, rate, option) {
    var cur = option.sign;
    var value = numeral(rate.rate * amount).format('0,0[.][00000000]');
    if (option.sign == '$' || option.sign == '£'){
        return '*' + numeral(amount).format('0,0[.][00000000]') + ' :dnt: = ' + cur +' '+ value + '*';
    }
    else {
        return '*' + numeral(amount).format('0,0[.][00000000]') + ' :dnt: = ' + value + ' ' + cur + '*';
    }
}

function icoprice(bot, channel, ico) {
    ico = parseFloat(ico);
    var message = '\n *' + 'ICO Price: 1 :dnt: = 0.0000719 ETH' + '* \n' + '*' +' Since ICO: '+ ico + 'x' + '*';
    bot.postMessage(channel, message, {icon_emoji: ':district0x:'});
}

function formaty(n, decimals, currency) {
    n = parseFloat(n);
    return currency + " " + n.toFixed(2).replace(/(\d)(?=(\d{3})+\.)/g, "$1,");
}

function doSteps(bot, channel, currency, amount) {

    var option = options.currencies[currency];
    var shouldReload = true;
    if (cachedRates[currency]) {
        var cache = cachedRates[currency];
        shouldReload = cache.time === null || moment().diff(cache.time) >= options.refreshTime;
        if (!shouldReload) {
            if (option.sign == 'ETH') {
                var coef = (cache.rate/0.0000719).toFixed(2);
                icoprice(bot, channel, coef);
            }
            var message = formatMessage(amount, cache, option);
            bot.postMessage(channel, message, {icon_emoji: ':district0x:'});
        }
    }

    if (shouldReload) {
        // copy the steps array
        var steps = [];
        for (var i = 0; i < option.steps.length; i++) {
            steps.push(option.steps[i]);
        }

        processSteps(bot, channel, currency, 0, amount, steps, option);
    }
}

function marketstats(bot,channel) {
    var statsurl='https://api.coinmarketcap.com/v1/ticker/district0x/';

    request.get(statsurl, function(error, response, body) {
        if (error) {
            bot.postMessage(channel, err.message ? err.message : 'The request could not be completed at this time. Please try again later.');
            return;
        }
        var marketcap = 0;
        var rank = 0;
        var volume24 = 0;
        try {

            var bodyString = '' + body;
            bodyString = bodyString.substring(1, bodyString.length -1);

            //JSON needs to be parsed twice to remove erroneous quotation mark resulting from parsing
            //'24h_volume_usd' the first time
            var cleanJSON = JSON.parse(JSON.parse(JSON.stringify(bodyString)));

            //cleaner value extraction
            volume24 = formaty(cleanJSON['24h_volume_usd'], 2, '$');
            marketcap = formaty(cleanJSON['market_cap_usd'], 2, '$');
            rank = cleanJSON['rank'];

        } catch (error) {
            console.log(error);
        }

        var statmsg = '*'+'Rank: '+ rank +  '* \n *Marketcap: '+ marketcap +'*\n' + '*Volume: ' + volume24 + '* \n';

        bot.postMessage(channel, statmsg, {icon_emoji: ':district0x:'});

    });
}

function bnb(bot,channel) {
    var statsurl='https://www.binance.com/api/v1/ticker/24hr?symbol=DNTETH';

    request.get(statsurl, function(error, response, body) {
        if (error) {
            bot.postMessage(channel, err.message ? err.message : 'The request could not be completed at this time. Please try again later.');
            return;
        }

        var pricebnb = 0;
        try {

            //var bodyString = '' + body;
            //bodyString = bodyString.substring(1, bodyString.length -1);

            //JSON needs to be parsed twice to remove erroneous quotation mark resulting from parsing
            //'24h_volume_usd' the first time
            var cleanJSON = JSON.parse(body);

            //cleaner value extraction
            //pricebnb = formaty(cleanJSON['lastPrice'], 2, '$');
            pricebnb = cleanJSON['lastPrice'];

        } catch (error) {
            console.log(error);
        }

        var statmsg = '*'+'Binance Price: '+ pricebnb +  '* \n';

        bot.postMessage(channel, statmsg, {icon_emoji: ':district0x:'});

    });
}

function processSteps(bot, channel, currency, rate, amount, steps, option) {
    if (steps.length > 0) {
        var pairName = steps[0];
        if (!options.api[pairName]) {
            bot.postMessage(channel, 'There was a configuration error. ' + pairName + ' pair was not found.');
            return;
        }

        var pair = options.api[pairName];
        request.get(pair.url, function(error, response, body) {
            if (error) {
                bot.postMessage(channel, err.message ? err.message : 'The request could not be completed at this time. Please try again later.');
                return;
            }
            var pairRate = 0;
            try {
                pairRate = jp.query(JSON.parse(body), pair.path);
                if (Array.isArray(pairRate) && pairRate.length > 0) {
                    pairRate = pairRate[0];
                }
            } catch (ignored) {
                // invalid response or pair rate
            }

            if (pairRate > 0) {
                rate = (rate === 0) ? pairRate : rate * pairRate;
                steps.shift();
                if (steps.length > 0) {
                    processSteps(bot, channel, currency, rate, amount, steps, option);
                    return;
                }

                // final step, cache and then response
                var result = { rate: rate, time: moment() };
                cachedRates[currency] = result;

                if (option.sign == 'ETH') {
                    var coef = (result.rate/0.0000719).toFixed(2);
                    icoprice(bot, channel, coef);
                }

                bot.postMessage(channel, formatMessage(amount, result, option), {icon_emoji: ':bulb:'});
            } else {
                bot.postMessage(channel, 'The rate returned for the ' + pairName + ' pair was invalid.');
            }
        });
    }
}
