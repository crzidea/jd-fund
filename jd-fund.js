#!/usr/bin/env node
global.Promise = require('bluebird');
var fetch = require('node-fetch');
var _ = require('lodash');
var Table = require('cli-table-zh');
var cheerio = require('cheerio');
var qs = require('qs');
var config =require('./config.json');

var table = new Table({
  head: config.columns,
  //colWidths: [6, 20]
});

var list = [];
function fetchList(page) {
  var pageUrl = config.urls.list + '?' + qs.stringify({page: page});
  return fetchToSuccess(pageUrl)
  .then(function(res) {
    return res.text();
  })
  .then(function(body) {
    var $ = cheerio.load(body);
    var $rows = $('.bill-wrap .kind-main .fund-wrap table tr.sec-tr');
    var detailPromises = [];
    // .map() != Array.prototype.map
    //for (var i = 0, l = $rows.length; i < l; i++) {
      //var row = $rows[i];
    $rows.each(function (index, row) {
      var data = {};
      var $cols = $(row).find('th');
      data.code = $($cols[0]).text().trim();
      data.name = $($cols[1]).text().trim();
      data.lastMonth = $($cols[5]).text().trim();
      data.detail = [];
      var detailPromise = fetchDetail(data.code, data.detail);
      list.push(data);
      detailPromises.push(detailPromise);
    });
    return Promise.all(detailPromises);
  })
}

function fetchDetail(code, list) {
  var promises = [];
  for (var i = 0, l = 3; i < l; i++) {
    (function(i) {
      var query = {fundCode: code, pageIndex: i + 1};
      var detailUrl = config.urls.history + '?' + qs.stringify(query);
      var promise = fetchToSuccess(detailUrl)
      .then(function(res) {
        return res.text();
      })
      .then(function(body) {
        var $ = cheerio.load(body);
        var $rows = $('tbody tr');
        for (var i = 0, l = $rows.length; i < l; i++) {
          var row = $rows[i];
          var $cols = $(row).find('td');
          var value = +$($cols[1]).text().trim();
          list.push(value);
        }
      })
      promises.push(promise);
    }(i));
  }
  return Promise.all(promises);
}

function fetchToSuccess(url) {
  return fetch(
    url,
    {
      timeout: 500
    }
  )
  .then(function(res) {
    if (res.status >= 400) {
      throw Error('HTTP status code should not be greater than 400');
    }
    return res;
  })
  .catch(function(err) {
    console.error(err);
    return fetchToSuccess(url);
  })
}

var loaderList = [];
for (var i = 0, l = 10; i < l; i++) {
    loaderList.push(fetchList(i+1));
}

Promise.all(loaderList)
.then(function() {
  list.forEach(function(fund) {
    var valueToday = fund.detail[0];
    fund.lessThan = 0;
    for (var i = 1, l = fund.detail.length; i < l; i++) {
      var value = fund.detail[i];
      if (value < valueToday) {
        fund.lessThan++;
      }
    }
    var max = _.max(fund.detail);
    var min = _.min(fund.detail);
    fund.difference = max - min;
  });
  list.sort(function(a, b) {
    return b.lessThan - a.lessThan;
  });

  for (var i = 0, l = list.length; i < l; i++) {
    var record = list[i];
    table.push([
      record.code,
      record.name,
      record.lessThan,
      record.detail.length,
      record.difference.toFixed(2),
      record.lastMonth
    ]);
  }
  process.stdout.write(table.toString());
  process.stdout.write('\n');
})
.catch(function(err) {
  console.error(err.stack);
});
