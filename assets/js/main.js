/* global d3 */ // d3 global alias
/* global topojson */ // topojson alias
/* global ss */ // simple-statistics alias

// wrap everything in a self-executing anonymous function to move to local scope / avoid global scope
(function () {
  // (start) pseudo-global variables
  // attributes for data join, coordinated visualization re-expression on selection
  var attrArray = [
    'race',
    'age',
    'education',
    'income',
    'healthcare',
    'native'
  ];

  // attribute labels for chart title
  var attrLabel = {
    'race': {
      'chartLabel': 'Percent white',
      'label': '% white'
    },
    'age': {
      'chartLabel': 'Percent 65 years and over',
      'label': '% age 65+'
    },
    'education': {
      'chartLabel': 'Percent with a bachelor\'s degree (25 years and over)',
      'label': '% higher education'
    },
    'income': {
      'chartLabel': 'Percent of households earning $200,000 or more',
      'label': '% households earning $200k+'
    },
    'healthcare': {
      'chartLabel': 'Percent covered by private health insurance',
      'label': '% with private health insurance'
    },
    'native': {
      'chartLabel': 'Percent born in Vermont',
      'label': '% born in VT'
    }
  };

  // attribute expressed on page landing
  var expressed = attrArray[0];

  // chart frame dimensions
  var chartWidth = window.innerWidth * 0.525;
  var chartHeight = 700;
  var leftPadding = 25;
  var rightPadding = 2; // match 2px chartFrame stroke-width (set in style.css)
  var topBottomPadding = 50;
  var chartInnerWidth = chartWidth - leftPadding - rightPadding;
  var chartInnerHeight = chartHeight - topBottomPadding * 2;
  var translate = 'translate(' + leftPadding + ',' + topBottomPadding + ')';
  // (end) pseudo-global variables

  // create linear scale to size bars proportionally to frame
  var yScale = d3.scaleLinear()
    .range([600, 0])
    .domain([0, 100]);

  // run script on window load
  window.onload = setMap();

  function setMap () {
    // set map frame dimensions
    var width = window.innerWidth * 0.4;
    var height = 600;

    // create new <svg class="map"> container for map
    var map = d3.select('body')
      .append('svg')
      .attr('class', 'map')
      .attr('width', width)
      .attr('height', height);

    // append SVG <text> element for chartTitle
    var mapTitle = map.append('text')
      .attr('x', 20)
      .attr('y', 580)
      .attr('class', 'mapTitle')
      .text('Census tracts of Chittenden County, VT');

    // create the projection
    var projection = d3.geoAlbers() // create projection generator using Albers equal-area conic projection
      // remember: [longitude (x), latitude (y)]
      .center([0, 44.442]) // use longitude 0 to keep north "up"; use latitude of center coordinates of area of interest
      // no need to set rotate "roll" value, given it defaults to 0; with "roll" value rotate looks like: .rotate([74, 0, 0]) (third value is "roll")
      .rotate([73.10, 0]) // use latitude 0 to keep north "up"; use longitude of center coordinates of area of interest
      // no need to explicitly set standard parallels, using default [29.5, 45.5] per https://github.com/d3/d3-geo/blob/master/src/projection/albers.js
      // .parallels([29.5, 45.5])
      .scale(60000)
      .translate([width / 2, height / 2]);

    // create the path
    var path = d3.geoPath() // create path generator
      .projection(projection); // pass the projection generator to the .projection() operator of the path generator; "path" variable now holds the path generator

    var promises = [];
    promises.push(d3.csv('assets/data/vt_007_tract_2017_attr.csv'));
    promises.push(d3.json('assets/data/vt_007_tract_2017.topojson'));

    Promise.all(promises).then(function (values) {
      var tractData = values[0];

      // translate tract TopoJSON to GeoJSON in the DOM for rendering
      // "vt_007_tract_2017" is the object name in the TopoJSON file vt_007_tract_2017.topojson
      // .data() (in setEnumerationUnits()) requires array parameter, while topojson.feature() converts TopoJSON object to GeoJSON FeatureCollection object
      // tacking on .features to the end of the line accesses the array of features from the FeatureCollection, included for use with (i.e., pass as parameter to) .data() operator
      var tractGeoJSON = topojson.feature(values[1], values[1].objects.vt_007_tract_2017).features;

      // join tractData attributes to GeoJSON enumeration units (tracts)
      tractGeoJSON = joinData(tractGeoJSON, tractData);

      // accepts scale generator from makeColorScale() function, passing it tractData, to create color scale
      var colorScale = makeColorScale(tractData);

      // add enumeration units to the map and color according to color scale (created in makeColorScale() and passed to colorScale above)
      setEnumerationUnits(tractGeoJSON, map, path, colorScale);

      // add coordinated visualization
      setChart(tractData, colorScale);

      // create dropdown selector
      createDropdown(tractData);
    });
  }

  // join CSV attributes to TopoJSON geometries (tracts)
  function joinData (tractGeoJSON, tractData) {
    for (var i = 0; i < tractData.length; i++) {
      var csvTract = tractData[i];
      var tractKey = csvTract.TRACTCE;

      for (var a = 0; a < tractGeoJSON.length; a++) {
        var geoJSONProps = tractGeoJSON[a].properties;
        var geoJSONKey = geoJSONProps.TRACTCE;

        if (geoJSONKey === tractKey) {
          attrArray.forEach(function (attr) {
            var val = parseFloat(csvTract[attr]); // parseFloat() method converts CSV string attributes to numbers (necessary to work with a D3 linear scale)
            geoJSONProps[attr] = val;
          });
        }
      }
    }

    return tractGeoJSON; // return tractGeoJSON Features array including attributes joined from CSV
  }

  function setEnumerationUnits (tractGeoJSON, map, path, colorScale) {
    // add enumeration units (tracts) to the map
    // use .selectAll() method, with .data() and .enter(), to draw each feature (i.e., tract polygon) separately
    var tracts = map.selectAll('.tract')
      .data(tractGeoJSON)
      .enter()
      .append('path')
      .attr('class', function (d) { // assign unique class name per tract using tract code (e.g., "tract ce000500")
        return 'tract ce' + d.properties.TRACTCE; // "ce" prepended to tract code to enable highlight() function (can't select on selectors starting with a number)
      })
      .attr('d', path) // draw each <path> using each tract geometry
      // use anonymous function to apply choropleth() function to each datum's currently expressed attribute value to return its fill color
      // (applying choropleth() function here instead of colorScale() allows test for datum without attribute values, which are then styled white)
      .style('fill', function (d) {
        return choropleth(d.properties, colorScale);
      })
      .on('mouseover', function (d) {
        highlight(d.properties);
      })
      .on('mouseout', function (d) {
        dehighlight(d.properties);
      })
      .on('mousemove', moveLabel);

    var desc = tracts.append('desc')
      .text('{"stroke": "#ccc", "stroke-width": "0.5px"}');
  }

  // function to test for attribute value and return color
  function choropleth (props, colorScale) {
    // access expressed attribute value, as a number, and assign to variable "val"
    var val = parseFloat(props[expressed]);
    // test that attribute value exists and is a real number and if so return fill via colorScale
    if (typeof val === 'number' && !isNaN(val)) {
      return colorScale(val);
      // if no attribute value return white fill
    } else {
      return '#fff';
    }
  }

  // function to create color scale generator
  function makeColorScale (data) {
    // colors in *ascending* order (corresponding to values from lowest to highest value)
    var colorClasses = [
      '#eff3ff',
      '#bdd7e7',
      '#6baed6',
      '#3182bd',
      '#08519c'
    ];

    // create natural breaks (ckmeans) color scale generator
    var colorScale = d3.scaleThreshold()
      .range(colorClasses);

    // build array of *all* values of expressed attribute (set at top of script)
    var domainArray = [];
    for (var i = 0; i < data.length; i++) {
      var val = parseFloat(data[i][expressed]);
      domainArray.push(val);
    }

    // cluster data using ckmeans algorithm to create natural breaks
    // use simple-statistics ckmeans() method to initially generate five clusters from the domainArray
    // returns a nested array, with each cluster an array and each cluster array instantiated with attribute values that comprise it
    var clusters = ss.ckmeans(domainArray, 5);

    // use native JavaScript map() function to set each item of domainArray to minimum value of its cluster
    // no longer a nested array; results in minimum value of each cluster as each item of domainArray
    domainArray = clusters.map(function (d) {
      // use native JavaScript min() function to return minimum value of each nested cluster array
      return d3.min(d);
    });
    // use native JavaScript shift() method to remove first value from domainArray to create four class breakpoints
    // results in five classifications (minimum of each breakpoint is included in classification)
    domainArray.shift();

    // assign domainArray as color scale domain
    colorScale.domain(domainArray);

    // return scale generator
    return colorScale;
  }

  // function to create coordinated visualization (chart)
  function setChart (tractData, colorScale) {
    // create new <svg class="chart"> container for chart
    var chart = d3.select('body')
      .append('svg')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('class', 'chart');

    var chartBackground = chart.append('rect')
      .attr('class', 'chartBackground')
      .attr('width', chartInnerWidth)
      .attr('height', chartInnerHeight)
      .attr('transform', translate);

    var bars = chart.selectAll('.bar')
      .data(tractData)
      .enter()
      .append('rect')
      .sort(function (a, b) {
        return b[expressed] - a[expressed]; // sort bars in descending order of expressed value attribute
      })
      .attr('class', function (d) { // assign unique class name per neighborhood using uhf_code ("bar uhf_code")
        return 'bar ce' + d.TRACTCE; // "ce" prepended to tract code to enable highlight() function (can't select on selectors starting with a number)
      })
      .attr('width', chartInnerWidth / tractData.length - 1)
      .on('mouseover', highlight)
      .on('mouseout', dehighlight)
      .on('mousemove', moveLabel);

    // append SVG <desc> element for default bar stroke style (to update on coordinated feature highlight)
    var desc = bars.append('desc')
      .text('{"stroke": "none", "stroke-width": "0px"}');

    // append SVG <text> element for chartTitle
    var chartTitle = chart.append('text')
      .attr('x', 40)
      .attr('y', 30)
      .attr('class', 'chartTitle');

    // create y-axis generator using yScale linear scale
    var yAxis = d3.axisLeft()
      .scale(yScale);

    // place y-axis
    var axis = chart.append('g')
      .attr('class', 'axis')
      .attr('transform', translate)
      .call(yAxis);

    // create frame for chart border
    var chartFrame = chart.append('rect')
      .attr('class', 'chartFrame')
      .attr('width', chartInnerWidth)
      .attr('height', chartInnerHeight)
      .attr('transform', translate);

    // update chart on attribute selection
    updateChart(bars, tractData.length, colorScale);
  }

  // create dropdown menu for attribute selection
  function createDropdown (tractData) {
    var dropdown = d3.select('body')
      .append('select')
      .attr('class', 'dropdown')
      .on('change', function () {
        changeAttribute(this.value, tractData);
      });

    // add initial option
    var titleOption = dropdown.append('option')
      .attr('class', 'titleOption')
      .attr('disabled', 'true')
      .text('Select attribute');

    // add attribute options
    var attrOptions = dropdown.selectAll('attrOptions')
      .data(attrArray)
      .enter()
      .append('option')
      .attr('value', function (d) {
        return d;
      })
      .text(function (d) {
        return d;
      });
  }

  // dropdown change listener handler
  function changeAttribute (attribute, tractData) {
    // update expressed attribute
    expressed = attribute;

    // recreate color scale
    var colorScale = makeColorScale(tractData);

    // recolor enumeration units (tracts)
    var tracts = d3.selectAll('.tract')
      .transition()
      .duration(500) // 500 milliseconds to complete transition
      .style('fill', function (d) {
        return choropleth(d.properties, colorScale);
      });

    // re-sort bars with transition
    var bars = d3.selectAll('.bar')
      .sort(function (a, b) {
        return b[expressed] - a[expressed];
      })
      .transition()
      .delay(function (d, i) { // delay animation of each bar by 20 additional milliseconds
        return i * 20;
      })
      .duration(500); // 500 milliseconds for each bar to complete transition

    // re-position, resize, and recolor bars
    updateChart(bars, tractData.length, colorScale);
  }

  // function to re-position, resize, and recolor bars on attribute selection
  function updateChart (bars, n, colorScale) {
    bars.attr('x', function (d, i) {
      return i * (chartInnerWidth / n) + leftPadding;
    })
      .attr('height', function (d, i) {
        return 600 - yScale(parseFloat(d[expressed])); // set bar height by applying linear scale to expressed attribute value (number must match y-scale linear range)
      })
      .attr('y', function (d, i) {
        return yScale(parseFloat(d[expressed])) + topBottomPadding; // subtract scale value from chart height to set y position, growing bars up from the bottom
      })
      .style('fill', function (d) {
        return choropleth(d, colorScale); // apply choropleth function to color each bar according to its class
      });

    // update chart title with selected attribute
    var chartTitle = d3.selectAll('.chartTitle')
      .text(attrLabel[expressed]['chartLabel']);
  }

  // function to highlight coordinated interaction (map enumeration units + chart bars)
  function highlight (props) {
    var selected = d3.selectAll('.ce' + props.TRACTCE)
      .style('stroke', '#ef5641')
      .style('stroke-width', '3');

    setLabel(props);
  }

  // function to reset element style on mouseout
  function dehighlight (props) {
    var selected = d3.selectAll('.ce' + props.TRACTCE)
      .style('stroke', function () {
        return getStyle(this, 'stroke');
      })
      .style('stroke-width', function () {
        return getStyle(this, 'stroke-width');
      });

    function getStyle (element, styleName) {
      var styleText = d3.select(element)
        .select('desc')
        .text();

      var styleObject = JSON.parse(styleText);

      return styleObject[styleName];
    }

    d3.select('.infolabel')
      .remove();
  }

  // function to create dynamic label (i.e., tooltip)
  function setLabel (props) {
    var labelAttribute = '<h1>' + props[expressed] + '</h1><br>' + attrLabel[expressed]['label'];

    var infolabel = d3.select('body')
      .append('div')
      .attr('class', 'infolabel')
      .attr('id', props.TRACTCE + '_label')
      .html(labelAttribute);

    var tractName = infolabel.append('div')
      .attr('class', 'labelname')
      .html('<small>Tract code: ' + props.TRACTCE + '</small>'); // replace with name attribute here
  }

  // function to move label with mouse
  function moveLabel () {
    // get width of label
    var labelWidth = d3.select('.infolabel')
      .node() // d3 .node() selection operator
      .getBoundingClientRect() // native JavaScript method; returns the size of an element and its position relative to the viewport
      .width;

    var x1 = d3.event.clientX + 10;
    var y1 = d3.event.clientY - 75;
    var x2 = d3.event.clientX - labelWidth - 10;
    var y2 = d3.event.clientY + 25;

    var x = d3.event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1;
    var y = d3.event.clientY < 75 ? y2 : y1;

    d3.select('.infolabel')
      .style('left', x + 'px')
      .style('top', y + 'px');
  }
})();
