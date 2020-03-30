// tree config variables, will be overwritten by treeViewerSettings.js
// when used in SIRIUS, values set here will have no effect
var data, data_json, root,
    annot_fields = ['mz', 'massDeviationMz', 'relativeIntensity'],
    popup_annot_fields = ['massDeviationPpm', 'score'],
    color_variant = "rel_int", color_scheme = "blues",
    show_edge_labels = true, show_node_labels = true,
    centered_node_labels = true, edit_mode=true, show_color_bar = true,
    edge_label_boxes = false, edge_labels_angled = true, loss_colors = true,
    deviation_colors = true;
// constants that will probably not be configurable
var SNAP_THR = 0;
// statistics for color coding
var md_ppm_max, md_ppm_min, md_mz_max, md_mz_min,
    rel_int_max;
// misc
var max_box_text;
var nodeToMove = null, unambig_mode = 'none',
    moveModes = {};
var brushTransition = d3.transition().duration(500),
    zeroTransition = d3.transition().duration(0);
var colorGen, loss_colors_dict, losses;
// use innerWidth/Height (for renderers other than WebView)
var window_use_inner = false;
// theming
var styles = {'elegant': {'node-rect': {'stroke' : 'transparent'},
                          'node-rect-hovered': {'stroke': 'black',
                                                'stroke-width': 2,
                                                'stroke-dasharray': '7,7'},
                          'link-line': {'stroke-width': 2}},
              'classic': {'node-rect': {'stroke' : 'black',
                                        'stroke-width': 1},
                          'node-rect-hovered': {'stroke': 'black',
                                                'stroke-width': 2,
                                                'stroke-dasharray': ''},
                          'link-line': {'stroke-width': 1}}};
var theme = 'elegant';

// utility functions
Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
};

// returns JSON object of the input string if valid
function validateInput(input_string){
    // input has to be a valid JSON object
    tree = JSON.parse(input_string);
    // tree has to have "fragments" and "losses" members
    if (!(tree.hasOwnProperty('fragments')
          && tree.hasOwnProperty('losses')
          && tree.fragments.hasOwnProperty('length')
          && tree.fragments.length > 0))
        throw 'tree has an invalid format';
    return tree;
}

// main entry function, to be called from sirius
function loadJSONTree(data_json){
    // NOTE: RESET VARIABLES HERE
    moveModes = {};
    colorGen = nextLossColor();
    loss_colors_dict = {};
    losses = [];
    if (d3.select(nodeToMove).size() == 0)
        // this prevents being stuck in move-mode when loading another
        // tree while in move-mode
        nodeToMove = null;
    // input
    try {
        data = validateInput(data_json);
    } catch (e) {
        // remove previously drawn SVG elements
        clearSVG();
        console.error('could not load tree: ' + e);
        return;
    }
    apply(data);
    scaleToFit();
}

// remove all drawn SVG objects
function clearSVG(){
    d3.selectAll('.node, .link, .brush').remove();
}

// when width/height of the page has changed, and/or node/link
// coordinates, but the data remains the same
function update(data_changed=false) {
    applyWindowSize();
    if (data_changed)
        generateTree(data);
    root = calcTreeLayout();
    drawNodes(root);
    drawNodeAnnots();
    drawLinks(root);
    scaleToFit();
    d3.select('#collapse_button').style('opacity', 0);
    if (data_changed){
        // apply zoom to new links/nodes etc.
        zoom_base.call(zoom.transform, currentZoom);
        svg.select('.brush').call(zoom.transform, currentZoom);
    }
}

// when mouse over a node, open popup
// when in move-mode, draw line between nodes to visualize
// moving
function handleMouseMove(){
    var x = getTransformedCoordinate(d3.event.offsetX, 'x'),
        y = getTransformedCoordinate(d3.event.offsetY, 'y');
    var hoveredNode = getNodeByPos(x, y, SNAP_THR),
        line_coords = [[], []],
        mode;
    if (hoveredNode != null){
        changeCursor('pointer');
        for (var style in styles[theme]['node-rect-hovered'])
            d3.select(hoveredNode).select('rect').style(
                style, styles[theme]['node-rect-hovered'][style]);
        popupOpen(hoveredNode.__data__);
        if (nodeToMove != null){
            var modes = getMoveModes(nodeToMove, hoveredNode);
            if (modes.length == 2){
                if (modes[0] == 'swap' && modes[1] == 'reconnect'){
                    unambig_mode = getAmbiguosMoveMode(x, y, modes, hoveredNode);
                    mode = unambig_mode;
                }else{
                    console.error('multiple modes ' + modes
                                  + ' are not supported');
                    mode = 'incompatible';
                }
            } else if (modes.length == 1)
                mode = modes[0];
            else
                console.error('this number of modes (' + modes.length
                              + ') is not supported: ' + modes);
            if (!moveModes.hasOwnProperty(nodeToMove.__data__.data
                                          .fragmentData.id))
                moveModes[nodeToMove.__data__.data.fragmentData.id] = {};
            moveModes[nodeToMove.__data__.data.fragmentData.id][
                hoveredNode.__data__.data.fragmentData.id] = modes;
        }
        else {
        }
    } else{
        changeCursor('move');
        popupClose();
        for (var style in styles[theme]['node-rect'])
            svg.selectAll('.node rect').style(style, styles[theme]['node-rect'][
                style]);
    }
    if (nodeToMove != null)
        line_coords[0] = [getTransformedCoordinate(nodeToMove.__data__.x, 'x',
                                                   true),
                          getTransformedCoordinate(nodeToMove.__data__.y
                                                   - boxheight, 'y', true)];
    else
        line_coords[0] = [0,0];
    line_coords[1] = getMoveLineEnd(x, y, mode, hoveredNode, nodeToMove);
    d3.select('#moveLine').attr('x1', line_coords[0][0])
        .attr('y1', line_coords[0][1])
        .attr('x2', line_coords[1][0])
        .attr('y2', line_coords[1][1])
        .attr('marker-end',
              (mode!='none' && mode!='parent' && mode!='incompatible')?
              'url(#end)':undefined)
        .attr('marker-start',
              (mode=='swap')?'url(#start)':undefined);
    d3.select('#moveLabel')
        .attr('dx', line_coords[0][0]
              + (line_coords[1][0] - line_coords[0][0])/2)
        .attr('dy', line_coords[0][1]
              + (line_coords[1][1] - line_coords[0][1])/2)
        .attr('transform', 'rotate(' + linkAngle(line_coords[0][0], line_coords[1][0],
                                         line_coords[0][1], line_coords[1][1])
                   + ',' + (line_coords[0][0]
                            + (line_coords[1][0] - line_coords[0][0])/2)
                   + ',' + (line_coords[0][1]
                            + (line_coords[1][1] - line_coords[0][1])/2) + ')')
        .text((mode != 'none' && mode != 'parent' && mode != 'incompatible')?
              mode:'');
    if (mode == 'parent' || mode == 'incompatible')
        d3.select('#moveLine').style('stroke', 'gray');
    else if (mode == 'none')
        d3.select('#moveLine').style('stroke', 'transparent');
    else
        d3.select('#moveLine').style('stroke', 'blue');
    // .attr('marker-start', 'url(#start)');
}

// activate node move/swap-mode, visualize moving possibilities
function handleClick(){
    if (!edit_mode)
        return;

    function clickedOnCollapse(){
        if (typeof(collapse_button) == 'undefined')
            return false;
        var collapse_rect = collapse_button.select('rect'),
            extent = [[parseFloat(collapse_button.attr('tr_x')),
                       parseFloat(collapse_button.attr('tr_x'))
                       + parseFloat(collapse_rect.attr('width'))],
                      [parseFloat(collapse_button.attr('tr_y')),
                       parseFloat(collapse_button.attr('tr_y'))
                       + parseFloat(collapse_rect.attr('height'))]],
            event_x = d3.event.offsetX,
            event_y = d3.event.offsetY;
        if (event_x >= extent[0][0] && event_x <= extent[0][1]
            && event_y >= extent[1][0] && event_y <= extent[1][1])
            return true;
    }

    stopTransition();
    var clickedNode = getNodeByPos(
        getTransformedCoordinate(d3.event.offsetX, 'x'),
        getTransformedCoordinate(d3.event.offsetY, 'y'));

    if (clickedNode != null){
        if (nodeToMove == null){
            if (clickedNode.__data__.parent != null) {
                adjustCollapseButton();
                var collapse_x = getTransformedCoordinate(
                    clickedNode.__data__.x - collapse_button_width / (
                        typeof(currentZoom) != 'undefined'?currentZoom.k:1) / 2,
                    'x', true),
                    collapse_y = getTransformedCoordinate(
                        clickedNode.__data__.y - boxheight + 2, 'y', true);
                d3.select('#collapse_button')
                    .attr('tr_x', collapse_x).attr('tr_y', collapse_y)
                    .attr('transform', 'translate(' + collapse_x + ',' + collapse_y
                          + ')')
                    .style('opacity', 1);
            }
            // move this node
            nodeToMove = clickedNode;
            // visualize source/target of move with line
            d3.select(clickedNode).style('opacity', 0.45);
            d3.select('svg').append('line')
                .attr('id', 'moveLine')
                .style('stroke', 'blue')
                .style('stroke-width', 2);
            d3.select('svg').append('text')
                .attr('id', 'moveLabel')
                .style('fill', 'blue');
        } else {
            if (clickedOnCollapse()){
                collapseNode(clickedNode);
                update(true);
            }
            // this is the target node/level
            var modes = getMoveModes(nodeToMove, clickedNode), mode;
            if (modes.length == 2)
                mode = unambig_mode;
            else
                mode = modes[0];
            moveNode(nodeToMove, clickedNode, mode);
            d3.select(nodeToMove).style('opacity', 1);
            nodeToMove = null;
            d3.selectAll('#moveLine').remove();
            d3.selectAll('#moveLabel').remove();
            d3.select('#collapse_button').style('opacity', 0);
        }
    }
}

function changeCursor(new_cursor){
    svg.select('.overlay').attr('cursor', new_cursor);
}

// generate and draw Tree for /new/ data
function apply(data) {
    applyWindowSize();
    // reset, remove SVG objects
    clearSVG();
    currentZoom = d3.zoomIdentity;
    brush_g = svg.append('g')   // all events are hooked to this DOM
        .attr('class', 'brush')
        .attr('x', 0)
        .attr('y', -margin_top)
        .on('contextmenu', function() { d3.event.preventDefault(); })
        .on('click', handleClick)
        .call(brush)
        .call(zoom)
        .on('dblclick.zoom', resetZoom)
        .on('mousemove', handleMouseMove);
        // .on('mousedown dragstart touchstart', stopTransition);
    tree_scale = 1;             // will be reset for new data
    // attempt to draw given tree
    generateTree(data);
    root = calcTreeLayout();
    drawTree();
    // apply settings
    colorCode(color_variant, color_scheme);
    toggleNodeLabels(show_node_labels);
    toggleEdgeLabels(show_edge_labels);
    toggleColorBar(show_color_bar);
}

function reset(){
    data = JSON.parse(data_json);
    apply(data);
    scaleToFit();
}

function popupOpen(d) {
    var popupStrings = [];
    popup_annot_fields.forEach(function(a) {
        popupStrings.push(formatAnnot(a, d.data.fragmentData[a]));
    });
    popup_div.style('opacity', 1);
    popup_div.html(popupStrings.join('<br>'))
        .style('left', (d3.event.clientX + 10) + 'px')
        .style('top', (d3.event.clientY + 10) + 'px');
}

function popupClose(d) {
    popup_div.style('opacity', 0);
}

function formatAnnot(id, value) {
    switch (id) {
    case "score":
        return "Score: " + parseFloat(value).toFixed(4);
    case "ion":
        return value;
    case "mz":
        return parseFloat(value).toFixed(4) + ' Da';
    case "massDeviation":
        // example: "-5.479016320565768 ppm (-0.0035791853184719002 m/z)"
        var number = parseFloat(value.split(' ')[0]);
        return number.toFixed(4) + ' ppm';
    case 'massDeviationPpm':
        return parseFloat(value).toFixed(4) + ' ppm';
    case 'massDeviationMz':
        return (value>0?"+":"")+(parseFloat(value) * 1000).toFixed(4) + ' mDa';
    case 'relativeIntensity':
        return parseFloat(value).toFixed(4) + " rel. int.";
    default:
        // for showing custom (not predefined) information,
        // that has to be present in 'data' though
        return value;
    }
}

// returns annotation color depending on type of annotation and value
function getAnnotColor(id, value) {
    value = parseFloat(value);
    var min, max;
    if (id == 'massDeviationMz'){
        min = md_mz_min;
        max = md_mz_max;
    } else if (id == 'massDeviationPpm'){
        min = md_ppm_min;
        max = md_ppm_max;
    } else
        return 'black';
    return interpolateBuBlRd(parseFloat(value) / Math.max(min, max) / 2 + 0.5);
}

function getLossColor(loss, colorFunction=colorLossByElements){
    return colorFunction(loss);
}

// @Deprecated
function colorLossByElements(loss){
    var elemColors = {
        'H': d3.hsl('White'),   // problematic
        'C': d3.hsl('Black'),    // problematic
        'N': d3.hsl('DarkBlue'),
        'O': d3.hsl('Red'),
        'Cl': d3.hsl('Green'),
        'Br': d3.hsl('DarkRed'), // problematic
        'I': d3.hsl('DarkViolet'), // problematic
        'P': d3.hsl('Orange'),
        'S': d3.hsl('Yellow'),
        'Fe': d3.hsl('DarkOrange'), // problematic
        undefined: d3.hsl('Pink')
    };
    var f = formulaStringToDict(loss);
    var colors = [];
    for (var el in f)
        if (f.hasOwnProperty(el)){
            var color = elemColors[elemColors.hasOwnProperty(el)
                                   ?el:undefined];
            color.l = Math.max(0.7-f[el]*0.08, 0.4);
            colors.push(color);
        }
    var color = colors[0];
    for (var i=1; i < colors.length; i++){
        color = d3.interpolateRgb(color, colors[i]);
    }
    return color;
}

function* nextLossColor(scheme=interpolateHslHue){
    var t = 0;
    var commonLosses_len = getCommonLosses().length;
    while (t < commonLosses_len)
        yield scheme(t++/commonLosses_len);
    yield "black";
}

function colorLossSequentially(loss){
    if (!loss_colors_dict.hasOwnProperty("commonLosses_initialized")){
        for (var loss of getCommonLosses())
            loss_colors_dict[loss] = colorGen.next().value;
        loss_colors_dict["commonLosses_initialized"] = true;
    }
    if (!loss_colors_dict.hasOwnProperty(loss))
        loss_colors_dict[loss] = colorGen.next().value;
    return loss_colors_dict[loss];
}

function colorLossDet(loss){
    // TODO implement
}

// value < 0: more blue
// value == 0: black
// value > 0: more red
function interpolateBuBlRd(value){
    value = (value - 0.5)*2;
    var red = (value>0)?(value*255):0;
    var blue = (value<0)?(-value*255):0;
    return 'rgb(' + Math.floor(red) + ', 0, ' + Math.floor(blue) + ')';
}

function interpolateHslHue(value, s=1, l=0.35){
    return d3.hsl(value*340,     // <360, because of repeating hues
                  s, l).toString();
}

// Tries to position link text (edge labels) optimally as to not overlap with
// the links themselves
function linkTextX(sx, tx) {
    // TODO: can be improved
    return (sx + tx) / 2 + ((sx > tx) ? -1 : 1) * 3;
}

// returns the x (dx) value of annotation text.
// Attempts to center the text to the decimal separator
function getAnnotX(d){
    var base_dx = this.parentNode.parentNode.__data__.x -
        (boxwidth / 2) + 5;
    var orig_content = this.textContent;
    // works with both '.' and ',' as decimal separator
    var decimal = orig_content.match(/[\.,]/);
    if (decimal == null)
        return base_dx;
    var dec_sep = decimal[0];
    this.textContent = this.textContent.split(dec_sep)[0] + dec_sep;
    /*
      NOTE:
      determine maximum offset: ~ the x-value the decimals are aligned to.
      with a third (<=3.15 exactly) of the boxwidth, 1-4 digit numbers (before decimal)
      can be perfectly aligned; this is dependent on the font though!!
    */
    var max_offset = boxwidth/3.15;
    var offset = max_offset - d3.select(this).node().getBBox().width;
    if (offset < 0)
        console.log('WARNING: decimals could not be perfectly aligned: '
                    + this.parentNode.parentNode.__data__.data.name);
    this.textContent = orig_content;
    return base_dx + Math.max(offset, 0);
}

function linkAngle(x1, x2, y1, y2){
    var angle = (x2==x1)?0:(Math.atan((y2-y1)/(x2-x1))*(180/Math.PI));
    return (angle>0)?angle:(360+angle);
}

function alignText(x, y, text, align, styles={}){
    if (align == null || align == 'start')
        return [x, y];
    var test_text_field = svg.append('text')
        .attr('class', 'test_text')
        .style('fill', 'white')
        .text(text);
    for (var style in styles)
        test_text_field.style(style, styles[style]);
    var bbox = test_text_field.node().getBBox();
    svg.selectAll('.test_text').remove();
    if (align == 'end')
        return [x - bbox.width, y];
    else if (align == 'middle')
        return [x - bbox.width/2, y];
}

function getTransformedCoordinate(coord, axis, reverse=false){
    if (axis == 'x'){
        if (!reverse)
            return ((coord/tree_scale)-currentZoom.x)/currentZoom.k;
        else
            return (coord*currentZoom.k+currentZoom.x)*tree_scale;
    }else{
        if (!reverse)
            return ((coord/tree_scale)-currentZoom.y)/currentZoom.k;
        else
            return (coord*currentZoom.k+currentZoom.y)*tree_scale;
    }
}

// returns the node having the specified coordinates (plus an optional
// radius). If there are multiple nodes, the one with the center
// closest to the coordinates is returned
function getNodeByPos(x, y, radius=0){
    var node, extent, center, dist, min_dist;
    d3.selectAll('.node').each(function (d){
        extent = [[d.x - boxwidth/2 - radius, d.x + boxwidth/2 + radius],
                  [d.y - boxheight - radius, d.y + radius]];
        center = [extent[0][0] + (extent[0][1] - extent[0][0])/2,
                  extent[1][0] + (extent[1][1] - extent[1][0])/2];
        if (x >= extent[0][0] && x <= extent[0][1] && y >= extent[1][0]
            && y <= extent[1][1]){
            dist = euclDist(x, center[0], y, center[1]);
            if (typeof(min_dist) == 'undefined' || dist < min_dist){
                min_dist = dist;
                node = this;
            }
        }
    });
    return node;
}

function getMoveLineEnd(x, y, mode, target=null, source=null){
    if (target == null)
        return [getTransformedCoordinate(x, 'x', true),
                getTransformedCoordinate(y, 'y', true)];
    if (mode == 'swap'){
        var coords = [euclDist(source.__data__.x, target.__data__.x - boxwidth/2,
                               source.__data__.y - boxheight,
                               target.__data__.y - boxheight/2),
                      euclDist(source.__data__.x, target.__data__.x + boxwidth/2,
                               source.__data__.y - boxheight,
                               target.__data__.y - boxheight/2)];
        var side = (Math.min(coords[0], coords[1]) == coords[0])?-1:1;
        return [getTransformedCoordinate(target.__data__.x
                                         + side * (boxwidth/2), 'x', true),
                getTransformedCoordinate(target.__data__.y
                                         - boxheight/2, 'y', true)];
    } else{
        return [getTransformedCoordinate(target.__data__.x, 'x', true),
                getTransformedCoordinate(target.__data__.y, 'y', true)];
    }
}

// when there are multiple move modes possible, chose it by visual cue
function getAmbiguosMoveMode(x, y, modes, target){
    if (modes[0] == 'swap' && modes[1] == 'reconnect') {
        var pull_up_dist = euclDist(x, target.__data__.x, y, target.__data__.y);
        var swap_dists = [
            euclDist(x, target.__data__.x - boxwidth/2, y,
                     target.__data__.y - boxheight/2),
            euclDist(x, target.__data__.x + boxwidth/2, y,
                     target.__data__.y - boxheight/2)
        ];
        if (Math.min(swap_dists[0], swap_dists[1]) <= pull_up_dist)
            return 'swap';
        else
            return 'reconnect';
    } else
        console.error('ambiguos modes ' + modes + ' are not supported!');
}

function euclDist(x1, x2, y1, y2){
    return Math.sqrt(Math.abs(x1 - x2)**2 +
                     Math.abs(y1 - y2)**2);
}

// returns coordinates of line between two nodes with minimum distance
function getNodeConnection(x1, y1, x2, y2){
    var min_dist = Infinity, min_conn;

    // commented lines allow for connections on the right/left of the node
    var points1 = [
        // [x1 - boxwidth/2, y1 - boxheight/2],
        // [x1 + boxwidth/2, y1 - boxheight/2],
        [x1, y1 - boxheight],
        [x1, y1]],
        points2 = [
            // [x2 - boxwidth/2, y2 - boxheight/2],
            // [x2 + boxwidth/2, y2 - boxheight/2],
            [x2, y2 - boxheight],
            [x2, y2]];
    points1.forEach(function(p1){
        points2.forEach(function(p2){
            var dist = euclDist(p2[0], p1[0], p2[1], p1[1]);
            if (dist < min_dist){
                min_dist = dist;
                min_conn = [p1, p2];
            }
        });
    });
    return min_conn;
}

// can be: ['none'], ['parent'], ['swap'], ['swap', 'reconnect'], ['pull-up'],
// ['reconnect'], ['incompatible']
function getMoveModes(node1, node2){
    var modes = [],
        source_id = node1.__data__.data.fragmentData.id,
        target_id = node2.__data__.data.fragmentData.id;
    if (moveModes.hasOwnProperty(source_id)
        && moveModes[source_id].hasOwnProperty(target_id))
        return moveModes[source_id][target_id];
    var source_name = node1.__data__.data.name,
        target_name = node2.__data__.data.name,
        source_parent_id = ((node1.__data__.parent == null)?null:
                            node1.__data__.parent.data.fragmentData.id),
        source_siblings = [], pull_up_ids = [];
    if (node1.__data__.parent != null){
        // determine siblings of source
        node1.__data__.parent.children.forEach(function (sibling){
            source_siblings.push(sibling.data.name);
        });
        // determine grandparents, great-grandparents, ... of source
        var ancestor = node1.__data__.parent;
        while((ancestor = ancestor.parent) != null)
            pull_up_ids.push(ancestor.data.fragmentData.id);
    }
    if (source_id == target_id){
        modes.push('none');
    } else if (target_id == source_parent_id){
        modes.push('parent');
    }else if (source_siblings.contains(target_name)){
        modes.push('swap');
        if (formulaIsSubset(source_name, target_name))
            modes.push('reconnect');
    } else if (pull_up_ids.contains(target_id))
        modes.push('pull-up');
    else {
        if (formulaIsSubset(source_name, target_name))
            modes.push('reconnect');
        else
            modes.push('incompatible');
    }
    return modes;
}

function moveNode(source, target, mode){
    var source_name = source.__data__.data.name,
        target_name = target.__data__.data.name,
        source_id = source.__data__.data.fragmentData.id,
        target_id = target.__data__.data.fragmentData.id,
        source_grandparent_name = ((source.__data__.parent == null ||
                                    source.__data__.parent.parent == null)?null:
                                   source.__data__.parent.parent.data.name),
        source_grandparent_id = ((source.__data__.parent == null ||
                                  source.__data__.parent.parent == null)?null:
                                 source.__data__.parent.parent.data
                                 .fragmentData.id);
    switch (mode){
    case 'swap':
        var indices = [];
        for (var i = 0; i < data.losses.length; i++)
            if (data.losses[i].target == source_name
                || data.losses[i].target == source_id
                || data.losses[i].target == target_name
                || data.losses[i].target == target_id)
                indices.push(i);
        if (indices.length == 2){
            var toInsert = data.losses.splice(indices[1], 1)[0];
            data.losses.splice(indices[0], 0, toInsert);
            update(true);
        } else
            console.error('could not find exactly 2 losses to be swapped');
        break;
    case 'pull-up':
        var source_loss_i, new_source, new_target;
        for (var i = 0; i < data.losses.length; i++){
            if (data.losses[i].target == source_name
                || data.losses[i].target == source_id){
                source_loss_i = i;
                new_target = data.losses[i].target;
            }
            else if (data.losses[i].source == source_grandparent_name
                     || data.losses[i].source == source_grandparent_id){
                new_source = data.losses[i].source;
            }
        }
        data.losses.splice(source_loss_i, 1);
        insertLoss({'molecularFormula':
                    formulaDiff(target_name,
                                source_name),
                    'source': new_source,
                    'target': new_target,
                    'score': 'nan',
                    'scores' : {}});
        update(true);
        requestNewScores(data);
        drawNodeAnnots();
        break;
    case 'reconnect':
        var source_loss_i, new_source, new_target;
        for (var i = 0; i < data.losses.length; i++){
            if (data.losses[i].target == source_name
                || data.losses[i].target == source_id) {
                source_loss_i = i;
                if (data.losses[i].target == source_id){
                    new_source = target_id;
                    new_target = source_id;
                } else {
                    new_source = target_name;
                    new_target = source_name;
                }
            }
        }
        data.losses.splice(source_loss_i, 1);
        var new_loss= {'molecularFormula':
                       formulaDiff(target_name, source_name),
                       'source': new_source,
                       'target': new_target,
                       'score': 'nan',
                       'scores' : {}};
        insertLoss(new_loss);
        update(true);
        requestNewScores(data);
        drawNodeAnnots();
        break;
    default:
        return;
    }
    moveModes = {};
}

function collapseNode(node){
    if (node.__data__.parent == null){
        console.error('The root cannot be collapsed');
        return;
    }
    var id = node.__data__.data.fragmentData.id,
        name = node.__data__.data.fragmentData.molecularFormula,
        parent = node.__data__.parent,
        parent_name = parent.data.fragmentData.molecularFormula,
        node_loss_i, node_descendant_losses_i = [];
    for (var i = 0; i < data.losses.length; i++){
        if (data.losses[i].target == id
            || data.losses[i].target == name)
            node_loss_i = i;
        else if (data.losses[i].source == id
                 || data.losses[i].source == name){
            node_descendant_losses_i.push(i);
        }
    }
    if (typeof(node_loss_i) == 'undefined'){
        console.error('The node to collapse has no incoming loss.'
                     + ' Data appears to be corrupt.');
        return;
    }
    node_descendant_losses_i.forEach(function(i){
        data.losses[i].source = data.losses[node_loss_i].source;
        data.losses[i].molecularFormula = formulaDiff(
            parent_name, node_map[data.losses[i].target].name);
        data.losses[i].score = 'nan';
        data.losses[i].scores = {};
    });
    data.losses.splice(node_loss_i,1);
    var node_fragments_i;
    for (var i = 0; i < data.fragments.length; i++)
        if (data.fragments[i].id == id)
            node_fragments_i = i;
    data.fragments.splice(node_fragments_i, 1);
}

// handles zoom/pan event
function zoomed() {
    stopTransition();
    popupClose();               // when panning, close popup
    var transform = d3.event.transform;
    currentZoom = transform; // storing for use by brush
    svg.selectAll('.node, .link')
        .attr('transform', transform.toString());
    // redrawing certain objects
    if (nodeToMove != null){
        d3.select('#moveLine')
            .attr('x1', getTransformedCoordinate(nodeToMove.__data__.x, 'x', true))
            .attr('y1', getTransformedCoordinate(nodeToMove.__data__.y - boxheight,
                                                 'y', true));
        var collapse_x = getTransformedCoordinate(
            nodeToMove.__data__.x - collapse_button_width/currentZoom.k/2,
            'x', true),
            collapse_y = getTransformedCoordinate(
                nodeToMove.__data__.y - boxheight + 2, 'y', true);
        d3.select('#collapse_button')
            .attr('tr_x', collapse_x).attr('tr_y', collapse_y)
            .attr('transform', 'translate(' + collapse_x + ',' + collapse_y
                  + ')');
    }
    adjustCollapseButton();
}

// handles brush event
function brushended() {
    var s = d3.event.selection, x, y, k;
    if (s == null)
        return;
    // adjusting selection for current zoom transformations
    s[1][0] = getTransformedCoordinate(s[1][0], 'x');
    s[0][0] = getTransformedCoordinate(s[0][0], 'x');
    s[1][1] = getTransformedCoordinate(s[1][1], 'y');
    s[0][1] = getTransformedCoordinate(s[0][1], 'y');
    var selection_width = (s[1][0] - s[0][0]);
    var selection_height = (s[1][1] - s[0][1]);
    k = Math.min((height-margin_top) / selection_height,
                 (width - margin_left) / selection_width) / tree_scale;
    x = -s[0][0] * k;
    y = -s[0][1] * k;
    var transform = d3.zoomIdentity.translate(x, y).scale(k);
    var t = d3.transition().duration(1000);
    zoom_base.call(zoom.transform, transform).transition(t);
    zoom_base.node().__zoom = transform;
    svg.select('.brush').node().__zoom = transform;
    svg.select('.brush').call(brush.move, null);
}


function resetZoom() {
    var t = d3.transition().duration(500).ease(d3.easeQuad);
    zoom_base.transition(t).call(zoom.transform, d3.zoomIdentity.scale(1));
    svg.select('.brush').transition(t).call(zoom.transform, d3.zoomIdentity.scale(1));
}

// fixes bug that clicks don't register after excessive use of zooms/drags/brush
// supposedly caused when a transition is interrupted
function stopTransition(){
    zoom_base.transition().duration(0);
    // svg.select('.brush').transition().duration(0);
}

function colorCode(variant, scheme) {
    var scheme_fn, attr, max, value, neg = false,
        t = d3.transition().duration(300).ease(d3.easeLinear);
    if (typeof(colorBar) != 'undefined'){
        svg.select('#cb').remove();
        colorBar.remove();
    }
    if (typeof (scheme) == "string") {
        // Java, when executing this function, can not pass the function
        // objects, so it will have to use strings
        switch (scheme) {
        case 'blues':
            scheme_fn = d3.interpolateBlues;
            break;
        case 'greens':
            scheme_fn = d3.interpolateGreens;
            break;
        case 'reds':
            scheme_fn = d3.interpolateReds;
            break;
        case 'red to blue':
            scheme_fn = d3.interpolateRdBu;
            break;
        case 'brown to turquoise':
            scheme_fn = d3.interpolateBrBG;
            break;
        }
    } else if (typeof (scheme) == 'function')
        scheme_fn = scheme;
    // select respective maximum
    switch (variant) {
    case 'none':
        d3.selectAll('.node').selectAll('rect').transition(t).style('fill',
                                                                    'white');
        return;
    case 'md_ppm_abs':
        attr = 'massDeviationPpm';
        max = Math.max(Math.abs(md_ppm_min), Math.abs(md_ppm_max));
        break;
    case 'md_mz_abs':
        attr = 'massDeviationMz';
        max = Math.max(Math.abs(md_mz_min), Math.abs(md_mz_max));
        break;
    case 'md_ppm':
        attr = 'massDeviationPpm';
        max = Math.max(Math.abs(md_ppm_min), Math.abs(md_ppm_max));
        neg = true;
        break;
    case 'md_mz':
        attr = 'massDeviationMz';
        max = Math.max(Math.abs(md_mz_min), Math.abs(md_mz_max));
        neg = true;
        break;
    case 'rel_int':
        attr = 'relativeIntensity';
        max = rel_int_max;
        break;
    }
    if (max == 0)
        // prevents division by zero
        max = 0.0001;
    var colorScale = d3.scaleSequential(scheme_fn).domain([neg ? -max : 0,
                                                           max]);
    colorBar = svg.append('g')
        .attr('id', 'cb')
        .call(colorbarH(colorScale, 200, 10))
        .attr('transform', 'translate(' + parseInt(width - 220) + ',10)');
    max *= 1.5;           // avoid extreme coloring, e.g., black on dark red
    d3.selectAll('.node').selectAll('rect').
        transition(t).
        style('fill', function(d) {
            if (neg)
                value = (parseFloat(d.data.fragmentData[attr]) / max / 2 + 0.5);
            else
                value = Math.abs(parseFloat(d.data.fragmentData[attr])) / max;
            return scheme_fn(value);
    });
}

function toggleNodeLabels(state) {
    d3.selectAll('.node_label')
        .style('opacity', state ? 1 : 0);
}

function toggleEdgeLabels(state) {
    svg.selectAll('.link_text')
        .style('opacity', state?1:0);
    if (edge_label_boxes){
        svg.selectAll('.link_text_bg')
            .style('opacity', state?1:0);
    }
}

function toggleColorBar(state) {
    svg.select('#cb').style('opacity', state ? 100 : 0);
}

// generates d3 tree layout calculating node coordinates
// layout is calculated in regard to window width and height
function calcTreeLayout() {
    var root = d3.hierarchy(tree);  // generate hierarchy (necessary)
    var treeLayout = d3.tree();     // empty tree
    treeLayout.size([width - margin_left, height - margin_top
                     - 2]); // -2 as extra bottom margin
    treeLayout(root);               // generates x/y coordinates
    root.descendants().forEach(function(d) {
        d.y += margin_top;
        if (typeof(d['x_def']) == 'undefined' ||
            typeof(d['y_def']) == 'undefined'){
            d['x_def'] = d.x;
            d['y_def'] = d.y;
        }
        // if layout is recalculated, scale is kept
        d.x = d.x_def / tree_scale;
        d.y = d.y_def / tree_scale;
    });
    return root;
}


function createNode(parent, child_name, edgeData) {
    if (!(parent in node_map)) {
        if (typeof tree == 'undefined') {
            // root
            var new_node = {
                'name': parent,
                'parentEdge': undefined
            };
            tree = new_node;
            node_map[parent] = new_node;
        }
        else {
            console.error('node ' + child_name + ' could not be found, '
                + 'yet tree is not empty so it\'s not the root');
            return;
        }
    }
    var new_node = {
        'name': child_name,
        'parentEdge': edgeData
    };
    if (!('children' in node_map[parent]))
        node_map[parent]['children'] = [];
    node_map[parent].children.push(new_node);
    node_map[child_name] = new_node;
}

// generates tree hierarchy from sirius JSON fTree that can be used by d3
function generateTree(data) {
    node_map = {};
    tree = undefined;
    if (data.losses.length == 0) {
        // only one node in tree
        var node = {
            'name': data.fragments[0].molecularFormula,
            'parentEdge': undefined
        };
        node_map[node.name] = node;
        tree = node_map[node.name];
    }
    data.losses.forEach(function(loss) { // can be empty
        createNode(loss.source, loss.target, loss);
        // NOTE: edgeData contains redundant information 'source' and 'target'
    });
    addFragmentData(data);
    boxwidth = calcBoxwidth(max_box_text,
                            {'font-weight': 'bold', 'font-size': '12'});
}

// additionally to adding fragment data to tree nodes, also stores
// statistics used later on for coloring and graphical properties
function addFragmentData(data) {
    md_ppm_max = 0.0;
    md_ppm_min = 0.0;
    md_mz_max = 0.0;
    md_mz_min = 0.0;
    rel_int_max = 0.0;
    max_box_text = '';
    data.fragments.forEach(function(fragment) { // must not be empty!
        // Pre-processing of 'fragment' to make things simpler later
        // for display of these attributes as annotations
        fragment['massDeviationPpm'] = fragment.massDeviation.split(' ')[0];
        fragment['massDeviationMz'] = fragment.massDeviation.split(' ')[2].
            substring(1);
        // storing maxima/minima for color coding
        var md_ppm = parseFloat(fragment.massDeviationPpm);
        var md_mz = parseFloat(fragment.massDeviationMz);
        var rel_int = parseFloat(fragment.relativeIntensity);
        if (md_ppm > md_ppm_max)
            md_ppm_max = md_ppm;
        if (md_ppm < md_ppm_min)
            md_ppm_min = md_ppm;
        if (md_mz > md_mz_max)
            md_mz_max = md_mz;
        if (md_mz < md_mz_min)
            md_mz_min = md_mz;
        if (rel_int > rel_int_max)
            rel_int_max = rel_int;
        if (fragment.molecularFormula in node_map) {
            node_map[fragment.molecularFormula]['fragmentData'] = fragment;
        } else if (fragment.id in node_map) {
            // in JSON Trees obtained directly from Sirius losses refer to
            // fragments by ID instead of molecularFormula
            node_map[fragment.id]['fragmentData'] = fragment;
            node_map[fragment.id]['name'] = fragment.molecularFormula;
        }
        else {
            throw 'fragment ' + fragment.molecularFormula + ' does '
            + 'not exist in the tree';
        }
        if (fragment.molecularFormula.length > max_box_text.length)
            max_box_text = fragment.molecularFormula;
    });
}

// ensures that losses are in the right order, as generateTree depends
// on the order
// NOTE: not very efficient, use only when necessary
function sortLosses(data_losses){
    // NOTE: !!!!!! as of now does not work !!!!!!!!!!!!!!!!!
    var new_losses = [], old_losses = data_losses,
        root_name = data.root, root_id = 0, // NOTE: these *have* to be correct!
        known = [root_name, root_id],
        loss, i = 0;
    while (old_losses.length != 0){
        console.log(i);
        loss = old_losses[i].source;
        if (known.contains(loss)){
            new_losses.push(old_losses[i]);
            known.push(old_losses[i].target);
            console.log('new loss ' + loss);
            old_losses.slice(i, 1);
        }
        console.log('length: ' + old_losses.length);
        if (i >= old_losses.length - 1)
            i = 0;
        else
            i += 1;
    }
    return new_losses;
}

// inserts a new loss into the losses list. attempts to insert the
// loss at the center position when the target has children
function insertLoss(loss){
    var targets = [data.root, 0], sources = [], indices_possible = [],
        indices_optimal = [];
    for (var i = 0; i < data.losses.length; i++){
        targets.push(data.losses[i].target);
        sources.push(data.losses[i].source);
        if (targets.contains(loss.source) &&
            !sources.contains(loss.target)){
            indices_possible.push(i);
            if (data.losses[i].source == loss.source)
                indices_optimal.push(i);
        }
    }
    var indices = ((indices_optimal.length == 0)?
                   indices_possible:indices_optimal);
    if (indices.length != 0)
        data.losses.splice(indices[Math.floor(indices.length/2)]+1, 0, loss);
    else
        console.error('there is no place to insert this loss without '
                      + 'compromising the required order');
}

function drawNodes(root) {
    var node = scale_base.selectAll('.node')
        .data(root.descendants(), function(d) {
            return d.data.fragmentData.id;
        });
    var enter = node
        .enter()
        .append('g')
        .attr('class', 'node');

    // this is only set when nodes are created initially
    enter.append('rect')
        .attr('rx', 10)
        .attr('ry', 10)
        .style('fill', 'white');

    for (var style in styles[theme]['node-rect'])
        enter.selectAll('rect').style(style, styles[theme]['node-rect'][style]);

    // this is set every time the function is called (and initially)
    node.selectAll('.node rect')
        .data(root.descendants(), function(d) {
            return d.data.fragmentData.id;
        })
        .attr('x', function(d) {
            return d.x - boxwidth / 2;
        })
        .attr('y', function(d) { return d.y - boxheight; })
        .attr('width', boxwidth)
        .attr('height', boxheight);


    enter.append('text')
        .attr('class', 'node_label')
        .text(function(d) { return d.data.name; })
        .style('font-weight', 'bold')
        // .style('text-decoration', 'underline')
        .style('font-family', 'sans-serif')
        .style('font-size', '12');

    node.selectAll('.node_label')
        .data(root.descendants(), function(d) {
            return d.data.fragmentData.id;
        })
        .attr('dx', function(d) { return d.x
                                  + (centered_node_labels?0:
                                     (-(boxwidth / 2) + 5));})
        .attr('dy', function(d) { return d.y - boxheight + lineheight + 5; })
        .attr('text-anchor', centered_node_labels?'middle':'start');

    enter.append('g')
        .attr('class', 'node_annotations')
        .attr('dx', function(d) { return d.x
                                  -(boxwidth / 2) + 5;})
        .attr('text-anchor', 'start');

    node.exit().remove();
}

function drawNodeAnnots() {
    // for existing elements. attach data
    var annot = scale_base.selectAll('.node_annotations')
        .selectAll('.annot_text')
        .data(annot_fields, function(d) { return d; });

    // for new elements
    var enter = annot.enter()
        .append('text')
        .attr('class', 'annot_text')
        .text(function(d) {
            return (
                formatAnnot(d, this.parentNode.parentNode.__data__.data.
                    fragmentData[d]));
        })
        .attr('class', 'annot_text')
        .style('font-size', '12')
        .style('font-family', 'sans-serif');

    // for new AND existing elements
    enter.merge(annot)
        .attr('dy', function(d, i) {
            return this.parentNode.parentNode.__data__.y
                - boxheight + (2 + i) * lineheight + 5;
        })
        .attr('dx', getAnnotX)
        .attr('text-anchor', 'start')
        .style('fill', (deviation_colors?
                        (function (d) {return getAnnotColor(
                            d, this.parentNode. parentNode.__data__.data
                                .fragmentData[d]);})
                        :'black'));
    /*
      the y position for each element has to be updated, so that there will be
      always one element at the top position, even when the top element is deleted
    */

    // for deleted elements, i.e. annotations that should not be
    // displayed anymore
    annot.exit().remove();
}

function drawLinks(root) {
    var link = scale_base.selectAll('.link')
        .data(root.links(), function(d) {
            return [d.source.data.fragmentData.id,
            d.target.data.fragmentData.id];
        });

    link.exit().remove();

    var enter = link.enter()
        .append('g')
        .attr('class', 'link');

    enter.append('line')
        .attr('class', 'link_line')
        .style('stroke', 'black');

    for (var style in styles[theme]['link-line'])
        enter.selectAll('line').style(style, styles[theme]['link-line'][style]);

    link.selectAll('.link_line')
        .data(root.links(), function(d) {
            return [d.source.data.fragmentData.id,
            d.target.data.fragmentData.id];
        })
        .attr('x1', function(d) { return d.source.x; })
        .attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; })
        .attr('y2', function(d) { return d.target.y - boxheight; });

    enter.append('rect')
        .attr('class', 'link_text_bg')
        .attr('width', 0)
        .attr('height', 0);

    var loss;
    enter.append('text')
        .attr('class', 'link_text')
        .text(function(d) {
            // store losses for coloring
            loss = d.target.data.parentEdge.molecularFormula;
            if (!losses.contains(loss))
                losses.push(loss);
            return loss; })
        .style('font-size', '12')
        .style('font-family', 'sans-serif');

    link.selectAll('.link_text')
        .data(root.links(), function(d) {
            return [d.source.data.fragmentData.id,
            d.target.data.fragmentData.id];
        })
        .attr('dx', function(d) {
            if (edge_label_boxes)
                return (d.source.x+d.target.x)/2;
            else
                return linkTextX(d.source.x,
                                   d.target.x);
        })
        .attr('dy', function(d) {
            return (d.source.y +
                    (d.target.y - boxheight)) / 2
                - (edge_labels_angled?2:0);
        })
        .attr('text-anchor', function(d) {
            if (edge_label_boxes)
                return 'middle';
            else
                return ((d.source.x <= d.target.x) ? 'start' : 'end');
        })
        .attr('transform', function (d) {
            if (edge_labels_angled)
                return 'rotate(' + linkAngle(d.source.x, d.target.x, d.source.y,
                                             d.target.y - boxheight) + ',' +
                linkTextX(d.source.x, d.target.x) + ',' +
                (d.source.y + (d.target.y - boxheight)) / 2 + ')';
            else
                return null;
        })
        .style('fill', (loss_colors?
                        (function(d) { return getLossColor(
                            d.target.data.parentEdge.molecularFormula,
                            colorLossSequentially); })
                        :'black'));
    if (edge_label_boxes){
        link.selectAll('.link_text_bg')
            .style('fill', 'white')
            .style('stroke', 'black')
            .style('opacity', 1)
            .attr('bbox', function (d) { return d3.select(this).node().
                                         parentNode.children[2].getBBox();})
            .attr('x', function (d) { return d3.select(this).node().
                                      parentNode.children[2].getBBox().x-1;})
            .attr('y', function (d) { return d3.select(this).node().
                                      parentNode.children[2].getBBox().y;})
            .attr('width', function (d) { return d3.select(this).node().
                                          parentNode.children[2].getBBox()
                                          .width+2;})
            .attr('height', function (d) { return d3.select(this).node().
                                           parentNode.children[2].getBBox()
                                           .height;});
    } else{
        link.selectAll('.link_text_bg')
            .style('opacity', 0);
    }
}

function drawTree() {
    boxheight = (annot_fields.length + 1) * lineheight + 10;
    drawNodes(root);
    drawNodeAnnots();
    drawLinks(root);
    scaleToFit();
}

var tree, node_map;

// layout
// Parameters
var boxheight = 60;             // adapts to content
var boxwidth = 130;
var margin_left = 0;
var margin_top = boxheight + 3;
var lineheight = 13;
var width, height;

function calcLayout() {
    var window_width = window_use_inner?window.innerWidth:window.outerWidth;
    var window_height = window_use_inner?window.innerHeight:window.outerHeight;
    width = window_width - boxwidth / 2;
    height = window_height - boxheight / 2;
    margin_left = 0;
    margin_top = boxheight + 3;
}

function calcBoxwidth(max_box_text, styles){
    // NOTE: maxtext only considers formulae, annotations could be
    // longer! (hard to calculate beforehand though)
    var min_boxwidth = 130;
    var adapt_to_maxtext = true;
    if (!adapt_to_maxtext)
        return min_boxwidth;
    else{
        var test_text_field = svg.append('text')
            .attr('class', 'test_text')
            .style('fill', 'white')
            .text(max_box_text);
        for (var style in styles)
            test_text_field.style(style, styles[style]);
        var bbox = test_text_field.node().getBBox();
        svg.selectAll('.test_text').remove();
        return Math.max(bbox.width + 10, min_boxwidth);
    }
}

function scaleTree(x_mag, y_mag = undefined) {
    root.descendants().forEach(function(node) {
        node.x = node.x_def * x_mag;
        if (typeof (y_mag) == 'undefined')
            y_mag = x_mag;
        node.y = node.y_def * y_mag;
        node.y -= margin_top * (y_mag - 1);
    });
    tree_scale = 1 / x_mag;
    if (typeof (scale_base) !== 'undefined')
        scale_base.attr('transform', 'scale(' + tree_scale + ')');
    drawNodes(root);
    drawNodeAnnots();
    drawLinks(root);
}

function scaleToFit() {
    tree_scale_min = computeMinScale();
    if (1 / tree_scale < tree_scale_min || typeof(tree_scale) == 'undefined')
        scaleTree(tree_scale_min);
    else
        scaleTree(Math.max(1, tree_scale_min));
}

function computeMinScale() {
    if (root.descendants().length == 1)
        // only one node
        return Math.min(boxwidth/width, boxheight/height);
    var min_dx = width;
    // NOTE: it is assumed, that levels are equidistant in y
    var min_dy = root.descendants()[1].y_def - root.descendants()[0].y_def;

    // finds min_dx for each level (considers only siblings)
    // NOTE: this could potentially pose a problem when non-siblings are close
    function computeMinDx(siblings){
        for (var i = 0; i < siblings.length; i++){
            if (i >= 1 && (siblings[i].x_def - siblings[i-1].x_def) < min_dx)
                min_dx = siblings[i].x_def - siblings[i-1].x_def;
            if (typeof(siblings[i].children) != 'undefined')
                computeMinDx(siblings[i].children);
        }
    }

    computeMinDx([root]);
    var min_scale_y = (boxheight + 30) / min_dy;
    var min_scale_x = (boxwidth + 20) / min_dx;
    return Math.max(min_scale_x, min_scale_y);
}

function applyWindowSize() {
    calcLayout();
    d3.select('svg').attr('width', width).attr('height', height);
    zoom_base.attr('width', width).attr('height', height);
    d3.select('.overlay')
        .attr('width', width)
        .attr('height', height);
    d3.select('#cb').attr('transform', 'translate(' + parseInt(width - 220) + ',10)');
}

// DOM elements
var svg, zoom_base, scale_base, popup_div, collapse_button, colorBar,
    zoom, currentZoom, brush, brush_g, tree_scale, tree_scale_min;
svg = d3.select('body').append('svg')
    .attr('width', width).attr('height', height)
    .attr('id', 'svg')
    .append('g');

zoom_base = svg.append('rect')
    .attr('id', 'zoom_base')
    .style('opacity', 0)
    .style('stroke', 'green')
    .style('fill', 'white')
    .attr('x', 0)
    .attr('y', -margin_top);

scale_base = svg.append('g')
    .attr('class', 'scale_base');

popup_div = d3.select('body').append('div')
    .attr('class', 'popup')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('pointer-events', 'none')
    .style('background', 'lightsteelblue')
    .style('font-size', '12')
    .style('font-family', 'sans-serif')
    .style('padding', '2px')
    .style('border-radius', '8px');

var collapse_button_width, collapse_button_line_coords;
function adjustCollapseButton(){
    collapse_button_width = boxwidth/10*(
        typeof(currentZoom) != 'undefined'?currentZoom.k:1);
    d3.select('#collapse_button').select('rect')
        .attr('width', collapse_button_width)
        .attr('height', collapse_button_width);
    collapse_button_line_coords = [
        [[2, 2], [collapse_button_width - 2, collapse_button_width - 2]],
        [[2, collapse_button_width - 2], [collapse_button_width - 2, 2]]];
    d3.select('#collapse_line1')
        .attr('x1', collapse_button_line_coords[0][0][0])
        .attr('y1', collapse_button_line_coords[0][0][1])
        .attr('x2', collapse_button_line_coords[0][1][0])
        .attr('y2', collapse_button_line_coords[0][1][1]);
    d3.select('#collapse_line2')
        .attr('x1', collapse_button_line_coords[1][0][0])
        .attr('y1', collapse_button_line_coords[1][0][1])
        .attr('x2', collapse_button_line_coords[1][1][0])
        .attr('y2', collapse_button_line_coords[1][1][1]);
}
collapse_button = svg.append('g')
    .attr('id', 'collapse_button')
    .style('opacity', 0);
collapse_button.append('rect')
    .style('fill', 'white')
    .style('stroke', 'red');
collapse_button
    .append('line')
    .attr('id', 'collapse_line1')
    .style('stroke', 'red');
collapse_button
    .append('line')
    .attr('id', 'collapse_line2')
    .style('stroke', 'red');

svg.append("svg:defs").selectAll("marker")
    .data(["end", "start"])
    .enter().append("svg:marker")
    .attr("id", String)
    .attr("viewBox", "-10 -5 20 10")
    .attr("refX", function (d, i) {return [10, -10][i];})
    .attr("refY", -0)
    .attr("markerWidth", 15)
    .attr("markerHeight", 15)
    .attr("orient", "auto")
    .append("svg:path")
    .attr("d", function(d, i){
        return ["M0,-5L10,0L0,5", "M0,-5L-10,0L0,5"][i];
    })
    .style('fill', 'blue');

// Zooming
zoom = d3.zoom().on('zoom', zoomed);
brush = d3.brush().on('end', brushended);
brush.filter(function() {
    if (event.button == 2) {
        d3.event.preventDefault(); // no context menu
        return true;
    } else
        return false;
});

function getSVGString() {
    var s = new XMLSerializer();
    var svgData = s.serializeToString(document.getElementById('svg'));
    return svgData;
}

function getJSONTree() {
    return JSON.stringify(data);
}

// calculates coordinates for all text elements under consideration of
// text-anchors. text-anchors will be reset to default.
// this function is intended for environments where text-anchor is not supported
function realignAllText(){
    var sel, coords;
    d3.selectAll('text').each(function (){
        sel = d3.select(this);
        coords = alignText(sel.attr('dx'), sel.attr('dy'), sel.text(),
                           sel.attr('text-anchor'),
                           {'font-family': sel.style('font-family'),
                            'font-weight': sel.style('font-weight'),
                            'font-size': sel.style('font-size')});
        sel.attr('dx', coords[0])
            .attr('dy', coords[1])
            .attr('text-anchor', 'start');
    });
}
