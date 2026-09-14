var TideKP = (function () {
    function TideKP(year, month, day, hour, minute) {
        // this.arcots = null;
        this.hourDST = 0;
        if (this.tideHoursChart === undefined)
            this.tideHoursChart = null;
        if (this.tideHeightChart === undefined)
            this.tideHeightChart = null;
        if (this.tideHoursHighLow === undefined)
            this.tideHoursHighLow = null;
        if (this.tideHeightHighLow === undefined)
            this.tideHeightHighLow = null;
        if (this.hoursYear === undefined)
            this.hoursYear = 0;
        if (this.currentTime === undefined)
            this.currentTime = 0;
        if (this.currentHeight === undefined)
            this.currentHeight = 0;
        if (this.dst === undefined)
            this.dst = null;
        if (this.strHighLow === undefined)
            this.strHighLow = null;
        if (this.timeHighLow === undefined)
            this.timeHighLow = null;
        if (this.hhmmHighLow === undefined)
            this.hhmmHighLow = null;
        if (this.heightHighLow === undefined)
            this.heightHighLow = null;
        if (this.numHighLow === undefined)
            this.numHighLow = 0;
        if (this.Daylight_Savings_Time === undefined)
            this.Daylight_Savings_Time = null;
        if (this.labelsHighLow === undefined)
            this.labelsHighLow = [];
        if (this.labelCurrent === undefined)
            this.labelCurrent = null;
        this.initialize(year, month, day, hour, minute);
    }
    TideKP.prototype.initialize = function (year, month, day, hour, minute) {
        this.dst = [false];
        if (this.dst[0] === true) {
            this.hourDST = 1;
        }
        else {
            this.hourDST = 0;
        }
        // this.arcots = new Arcots(year);
        this.hoursYear = (this.daysOfYear(month, day, year) - 1) * 24;
        this.tideHoursChart = (function (s) {
            var a = []; while (s-- > 0)
                a.push(0); return a;
        })(24 * 60);
        this.tideHeightChart = (function (s) {
            var a = []; while (s-- > 0)
                a.push(0); return a;
        })(24 * 60);
        for (var i = 0; i < 24 * 60; i++) {
            {
                this.tideHoursChart[i] = (i) / 60;
                this.tideHeightChart[i] = this.TIDE(this.hoursYear + this.tideHoursChart[i], this.hourDST);
            }
            ;
        }
        this.tideHoursHighLow = (function (s) {
            var a = []; while (s-- > 0)
                a.push(0); return a;
        })(24 * 60 + 2);
        this.tideHeightHighLow = (function (s) {
            var a = []; while (s-- > 0)
                a.push(0); return a;
        })(24 * 60 + 2);
        for (var i = 0; i < (24 * 60 + 2); i++) {
            {
                this.tideHoursHighLow[i] = (i) / 60 - 1.0 / 60.0;
                this.tideHeightHighLow[i] = this.TIDE(this.hoursYear + this.tideHoursHighLow[i], this.hourDST);
            }
            ;
        }
        this.currentTime = hour + minute / 60.0;
        this.currentHeight = this.TIDE(this.hoursYear + this.currentTime, this.hourDST);
        this.strHighLow = [null, null, null, null];
        this.timeHighLow = [0, 0, 0, 0];
        this.hhmmHighLow = [null, null, null, null];
        this.heightHighLow = [0, 0, 0, 0];
        this.HIGLOW();
        var ind = [];
        for (var i = 0; i < this.timeHighLow.length; i++) {
            if (this.timeHighLow[i] != 0 && this.heightHighLow[i] != 0) {
                ind.push(i);
            }
        }
        this.timeHighLow = this.timeHighLow.filter((x, i) => ind.includes(i));
        this.heightHighLow = this.heightHighLow.filter((x, i) => ind.includes(i));
    };
    TideKP.prototype.TIDE = function (T, hourDST) {
        var X = 0.0;
        T -= hourDST;
        for (var k = 0; k < 7; k++) {
            {
                // X = X + this.arcots.FH[k] * Math.cos(Arcots.S[k] * T + this.arcots.VUG[k]);
                X = X + window.arcots.FH[k] * Math.cos(Arcots.S[k] * T + window.arcots.VUG[k]);
            }
            ;
        }
        return X;
    };
    /*private*/ TideKP.prototype.HIGLOW = function () {
        var previous;
        var current;
        var next;
        var currTime;
        var k = 0;
        var hhmm;
        var date = new Date();
        var tideTimeLong;
        for (var i = 1; i < this.tideHeightHighLow.length - 1; i++) {
            {
                previous = this.tideHeightHighLow[i - 1];
                current = this.tideHeightHighLow[i];
                next = this.tideHeightHighLow[i + 1];
                currTime = this.tideHoursHighLow[i];
                tideTimeLong = (function (n) { return n < 0 ? Math.ceil(n) : Math.floor(n); })((currTime * 3600000.0 - 3600000.0));
                if (this.dst[0] === true) {
                    tideTimeLong -= 3600000.0;
                }
                date.setTime(tideTimeLong);
                hhmm = date.toString().substring(11, 16);
                if ((function (lhs, rhs) { return lhs && rhs; })((previous < current), (next < current))) {
                    this.timeHighLow[k] = currTime;
                    this.hhmmHighLow[k] = hhmm;
                    this.heightHighLow[k++] = current;
                }
                if ((function (lhs, rhs) { return lhs && rhs; })((previous > current), (next > current))) {
                    this.timeHighLow[k] = currTime;
                    this.hhmmHighLow[k] = hhmm;
                    this.heightHighLow[k++] = current;
                }
            }
            ;
        }
        this.numHighLow = k;
    };
    /*private*/ TideKP.prototype.daysOfYear = function (MONTH, DAY_OF_MONTH, YEAR) {
        var nMonth = MONTH;
        var nDay = DAY_OF_MONTH;
        var nYear = YEAR;
        var nDayInYear = 0;
        for (var nM = 1; nM < nMonth; nM++) {
            {
                switch ((nM)) {
                    case 4:
                    case 6:
                    case 9:
                    case 11:
                        nDayInYear += 30;
                        break;
                    case 2:
                        nDayInYear += 28;
                        if (((nYear % 4) === 0) && ((nYear % 100) !== 0)) {
                            nDayInYear++;
                        }
                        break;
                    default:
                        nDayInYear += 31;
                }
            }
            ;
        }
        nDayInYear += nDay;
        return nDayInYear;
    };
    return TideKP;
}());
TideKP["__class"] = "TideKP";
getInitialTidalChart = function () {
    window.date = new Date(); //declaring global variable by window object.
    year = window.date.getFullYear();
    window.arcots = new Arcots(year);
    var date1 = window.date;
    document.getElementById("choosedate").value = date1.toISOString().slice(0, 10);
    var text1 = getTideChart(window.date);
    document.getElementById("currtxt").innerText = text1;
}
getChoosenTidalChart = function () {
    var dateNow = new Date();
    var dateChoosen = new Date(document.getElementById("choosedate").value);
    dateChoosen.setHours(dateNow.getHours());
    dateChoosen.setMinutes(dateNow.getMinutes());
    dateChoosen.setSeconds(dateNow.getSeconds());
    var year_old = window.date.getFullYear();
    var year_new = dateChoosen.getFullYear();
    window.date = dateChoosen;
    if (year_old != year_new) {
        window.arcots = new Arcots(year_new);
    }
    var text1 = getTideChart(window.date);
    document.getElementById("currtxt").innerText = text1;
}
getNextTidalChart = function () {
    var year_old = window.date.getFullYear();
    window.date.setDate(window.date.getDate() + 1);
    var year_new = window.date.getFullYear();
    if (year_old != year_new) {
        window.arcots = new Arcots(year_new);
    }
    var date1 = window.date;
    document.getElementById("choosedate").value = date1.toISOString().slice(0, 10);
    var text1 = getTideChart(window.date);
    document.getElementById("currtxt").innerText = text1;
}
getPrevTidalChart = function () {
    var year_old = window.date.getFullYear();
    window.date.setDate(window.date.getDate() - 1);
    var year_new = window.date.getFullYear();
    if (year_old != year_new) {
        window.arcots = new Arcots(year_new);
    }
    var date1 = window.date;
    document.getElementById("choosedate").value = date1.toISOString().slice(0, 10);
    var text1 = getTideChart(window.date);
    document.getElementById("currtxt").innerText = text1;
}
getTideChart = function (date) {
    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();
    hour = date.getHours();
    minute = date.getMinutes();
    day_of_week = date.getDay();
    var tideKP = new TideKP(year, month, day, hour, minute);
    tideHeight = tideKP.tideHeightChart;
    var x = 0;
    var len = tideHeight.length;
    while (x < len) {
        tideHeight[x] = tideHeight[x].toFixed(2);
        x++
    }
    var data = ['data1'];
    data = data.concat(tideHeight);
    var dataHighLow = ['data2'];
    dataHighLow = dataHighLow.concat(tideKP.heightHighLow);
    var dataCurrent = ['data3'];
    dataCurrent = dataCurrent.concat(tideKP.currentHeight);
    var hours = ['x'];
    hours = hours.concat(tideKP.tideHoursChart);
    var hours2 = ['x2'];
    hours2 = hours2.concat(tideKP.timeHighLow);
    var hours3 = ['x3'];
    hours3 = hours3.concat(tideKP.currentTime);
    dec2hhmm = function (decimalTimeString) {
        var n = new Date(0, 0);
        n.setMinutes(+decimalTimeString * 60);
        return n.toTimeString().slice(0, 5);
    }
    for (var i = 0; i < tideKP.timeHighLow.length; i++) {
        tideKP.labelsHighLow.push(dec2hhmm(tideKP.timeHighLow[i]) + ' ' + tideKP.heightHighLow[i].toFixed(1));
    }
    tideKP.labelCurrent = dec2hhmm(tideKP.currentTime) + ' ' + tideKP.currentHeight.toFixed(1);
    var chart = c3.generate({
        data: {
            // x: 'x',
            xs: {
                data1: 'x',
                data2: 'x2',
                data3: 'x3'
            },
            columns: [
                hours,
                hours2,
                hours3,
                data,
                dataHighLow,
                dataCurrent
            ],
            // labels: false,
            // labels: {
            //     format: {
            //         data2: function (v, id, i, j) { return tideKP.labelsHighLow[i] },
            //         data3: function (v, id, i, j) { return tideKP.labelCurrent },
            //     }
            // },
        },
        legend: {
            show: false
        },
        axis: {
            x: {
                tick: {
                    values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
                },
            },
            y: {
                max: 70,
                min: -70,
                // Range includes padding, set 0 if no padding needed
                // padding: {top:0, bottom:0}
            },
        },
        types: {
            // 'data2': 'scatter',
        },
        grid: {
            x: {
                show: true,
                lines: [
                    { value: 12, class: 'line12' },
                ]
            },
            y: {
                show: true,
                lines: [
                    { value: 0, class: 'line0' },
                ]
            },
        },
        point: {
            show: true,
            r: 5
        },
        tooltip: {
            format: {
                title: function (x, index) { return 'Ura: ' + dec2hhmm(x); },
                name: function (name, ratio, id, index) { return 'ViÅ¡ina (cm)'; },
                value: function (value, ratio, id) { return value.toFixed(1) }
            }
        },
        onrendered: function () {
            // https://stackoverflow.com/questions/31514097/how-to-add-labels-to-c3-js-scatter-plot-graph
            // get the parent of the the <circles> to add <text as siblings>
            var g = d3.selectAll('.c3-circles-data2');
            for (var i = 0; i < 5; i++) {
                var className = "c3-text c3-text-" + i;
                var txt = document.getElementsByClassName(className);
                if (typeof txt !== 'undefined') {
                    // the variable is defined
                    for (var j = 0; j < txt.length; j++) {
                        //document.getElementsByClassName(className)[j].textContent = '';
                        document.getElementsByClassName(className)[j].remove();
                    }
                }
            }
            //Get all circle tags
            var circles = g.selectAll('circle')._groups[0];
            //go to each circle and add a text label for it
            for (var i = 0; i < circles.length; i++) {
                //fetch x-coordinate
                var x = circles[i].cx;
                // var x = $(circles[i])[0].cx;
                //fetch y-coordinate
                // var y = $(circles[i])[0].cy;
                var y = circles[i].cy;

                //create and append the text tag
                g.append('text')
                    .attr('y', y.baseVal.value - 15)  // (-15) places the tag above the circle, adjust it according to your need
                    .attr('x', x.baseVal.value)
                    .attr('text-anchor', 'middle')
                    .attr('class', 'c3-text c3-text-' + i)
                    .text(tideKP.labelsHighLow[i]) // the text that needs to be added can be hard coded or fetched for the original data.
                //Since I am using a JSON to plot the data, I am referencing it and using the key of the value to be shown.
            }
            var inew = i + 1;
            // Current value
            // get the parent of the the <circles> to add <text as siblings>
            var g1 = d3.selectAll('.c3-circles-data3');
            //Get all circle tags
            var circles1 = g1.selectAll('circle')._groups[0];
            //go to each circle and add a text label for it
            for (var i = 0; i < circles1.length; i++) {
                //fetch x-coordinate
                var x = circles1[i].cx;
                // var x = $(circles[i])[0].cx;
                //fetch y-coordinate
                // var y = $(circles[i])[0].cy;
                var y = circles1[i].cy;

                //create and append the text tag
                g.append('text')
                    .attr('y', y.baseVal.value + 15)  // (-15) places the tag above the circle, adjust it according to your need
                    .attr('x', x.baseVal.value)
                    .attr('text-anchor', 'middle')
                    .attr('class', 'c3-text c3-text-' + inew)
                    .text(tideKP.labelCurrent) // the text that needs to be added can be hard coded or fetched for the original data.
                //Since I am using a JSON to plot the data, I am referencing it and using the key of the value to be shown.
            }
        },
    });
    var dnevi = ['nedelja', 'ponedeljek', 'torek', 'sreda', 'Äetrtek', 'petek', 'sobota'];
    var headText = dnevi[day_of_week] + ', ' + day + '.' + month + '.' + year;
    return headText;

}

