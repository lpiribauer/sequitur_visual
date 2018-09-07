function Rule() {
    // the guard node in the linked list of symbols that make up the rule
    // It points forward to the first symbol in the rule, and backwards
    // to the last symbol in the rule. Its own value points to the rule data 
    // structure, so that symbols can find out which rule they're in

    this.guard = new Symbol(this);
    this.guard.join(this.guard);

    //  referenceCount keeps track of the number of times the rule is used in the grammar
    this.referenceCount = 0;

    // this is just for numbering the rules nicely for printing; it's
    // not essential for the algorithm
    this.number = 0;

    this.uniqueNumber = Rule.uniqueRuleNumber++;
};

Rule.uniqueRuleNumber = 1;

Rule.prototype.first = function () {
    return this.guard.getNext();
}

Rule.prototype.last = function () {
    return this.guard.getPrev();
}

Rule.prototype.incrementReferenceCount = function () {
    this.referenceCount++;
};

Rule.prototype.decrementReferenceCount = function () {
    this.referenceCount--;
};

Rule.prototype.getReferenceCount = function () {
    return this.referenceCount;
};

Rule.prototype.setNumber = function (i) {
    this.number = i;
};

Rule.prototype.getNumber = function () {
    return this.number;
};


var digramIndex = {};

function Symbol(value) {
    this.next = null;
    this.prev = null;
    this.terminal = null;
    this.rule = null;

    // initializes a new symbol. If it is non-terminal, increments the reference
    // count of the corresponding rule

    if (typeof (value) == 'string') {
        this.terminal = value;
    } else if (typeof (value) == 'object') {
        if (value.terminal) {
            this.terminal = value.terminal;
        } else if (value.rule) {
            this.rule = value.rule;
            this.rule.incrementReferenceCount();
        } else {
            this.rule = value;
            this.rule.incrementReferenceCount();
        }
    } else {
        console.log('Did not recognize ' + value);
    }
};

/**
 * links two symbols together, removing any old digram from the hash table.
 */
Symbol.prototype.join = function (right) {

    if (this.next) {
        this.deleteDigram();

        // This is to deal with triples, where we only record the second
        // pair of the overlapping digrams. When we delete the second pair,
        // we insert the first pair into the hash table so that we don't
        // forget about it.  e.g. abbbabcbb

        if (right.prev && right.next &&
            right.value() == right.prev.value() &&
            right.value() == right.next.value()) {
            digramIndex[right.hashValue()] = right;
        }

        if (this.prev && this.next &&
            this.value() == this.next.value() &&
            this.value() == this.prev.value()) {
            digramIndex[this.hashValue()] = this;
        }
    }
    this.next = right;
    right.prev = this;
};

/**
 * cleans up for symbol deletion: removes hash table entry and decrements
 * rule reference count.
 */
Symbol.prototype.delete = function () {
    this.prev.join(this.next);
    if (!this.isGuard()) {
        this.deleteDigram();
        if (this.getRule()) {
            this.getRule().decrementReferenceCount();
        }
    }
};

/**
 * Removes the digram from the hash table
 */
Symbol.prototype.deleteDigram = function () {
    if (this.isGuard() || this.next.isGuard()) {
        return;
    }

    if (digramIndex[this.hashValue()] == this) {
        digramIndex[this.hashValue()] = null;
    }
};

/**
 * Inserts a symbol after this one.
 */
Symbol.prototype.insertAfter = function (symbol) {
    symbol.join(this.next);
    this.join(symbol);
};

/**
 * Returns true if this is the guard node marking the beginning and end of a
 * rule.
 */
Symbol.prototype.isGuard = function () {
    return this.getRule() && this.getRule().first().getPrev() == this;
};

/**
 * getRule() returns rule if a symbol is non-terminal, and null otherwise.
 */
Symbol.prototype.getRule = function () {
    return this.rule;
};

Symbol.prototype.getNext = function () {
    return this.next;
};

Symbol.prototype.getPrev = function () {
    return this.prev;
};

Symbol.prototype.getTerminal = function () {
    return this.terminal;
};

/**
 * Checks a new digram. If it appears elsewhere, deals with it by calling
 * match(), otherwise inserts it into the hash table.
 */
Symbol.prototype.check = function () {
    if (this.isGuard() || this.next.isGuard()) {
        return 0;
    }

    var match = digramIndex[this.hashValue()];
    if (!match) {
        digramIndex[this.hashValue()] = this;
        return false;
    }

    if (match.getNext() != this) {
        this.processMatch(match);
    }
    return true;
};


/**
 * This symbol is the last reference to its rule. It is deleted, and the
 * contents of the rule substituted in its place.
 */
Symbol.prototype.expand = function () {
    var left = this.getPrev();
    var right = this.getNext();
    var first = this.getRule().first();
    var last = this.getRule().last();

    if (digramIndex[this.hashValue()] == this) {
        digramIndex[this.hashValue()] = null;
    }

    left.join(first);
    last.join(right);

    digramIndex[last.hashValue()] = last;
};

/**
 * Replace a digram with a non-terminal
 */
Symbol.prototype.substitute = function (rule) {
    var prev = this.prev;

    prev.getNext().delete();
    prev.getNext().delete();

    prev.insertAfter(new Symbol(rule));

    if (!prev.check()) {
        prev.next.check();
    }
};

/**
 * Deal with a matching digram.
 */
Symbol.prototype.processMatch = function (match) {
    var rule;

    // reuse an existing rule
    if (match.getPrev().isGuard() &&
        match.getNext().getNext().isGuard()) {
        rule = match.getPrev().getRule();
        this.substitute(rule);
    } else {
        // create a new rule
        rule = new Rule();

        rule.last().insertAfter(new Symbol(this));
        rule.last().insertAfter(new Symbol(this.getNext()));

        match.substitute(rule);
        this.substitute(rule);

        digramIndex[rule.first().hashValue()] = rule.first();
    }

    // check for an underused rule
    if (rule.first().getRule() &&
        rule.first().getRule().getReferenceCount() == 1) {
        rule.first().expand();
    }
}

Symbol.prototype.value = function () {
    return this.rule ? this.rule : this.terminal;
};

Symbol.prototype.stringValue = function () {
    if (this.getRule()) {
        return 'rule:' + this.rule.uniqueNumber;
    } else {
        return this.terminal;
    }
};

Symbol.prototype.hashValue = function () {
    return this.stringValue() + '+' +
        this.next.stringValue();
};

// print the rules out

var ruleSet;
var outputArray;
var lineLength;
var transformSvg = "translate(20,20)scale(1)";

/**
 * @param {Rule} rule
 */
function printRule(rule) {

    for (var symbol = rule.first(); !symbol.isGuard(); symbol = symbol.getNext()) {
        if (symbol.getRule()) {
            var ruleNumber;

            if (ruleSet[symbol.getRule().getNumber()] == symbol.getRule()) {
                ruleNumber = symbol.getRule().getNumber();
            } else {
                ruleNumber = ruleSet.length;
                symbol.getRule().setNumber(ruleSet.length);
                ruleSet.push(symbol.getRule());
            }

            outputArray += (ruleNumber + ' ');
            lineLength += (ruleNumber + ' ').length;
        } else {
            outputArray += (printTerminal(symbol.value()));
            outputArray += (' ');
            lineLength += 2;
        }
    }

}

function printTerminal(value) {
    if (value == ' ') {
        //    return '\u2423'; // open box (typographic blank indicator).
        return '_'; // open box (typographic blank indicator).
    } else if (value == '\n') {
        return '¶';
    } else if (value == '\t') {
        return '⇥';
    }
    /*else if (value == '\\' ||
           value == '(' ||
           value == ')' ||
           value == '_' ||
           value.match(/[0-9]/)) {
           return ('\\' + symbol.value());
       } */
    else {
        return value;
    }
}

function printRuleExpansion(rule) {
    outputArray += "|";
    for (var symbol = rule.first(); !symbol.isGuard(); symbol = symbol.getNext()) {
        if (symbol.getRule()) {
            printRuleExpansion(symbol.getRule());
        } else {
            outputArray += (printTerminal(symbol.value()));
        }
    }
}

function printGrammar(S) {

    ruleSet = [];
    ruleSet[0] = S;
    $('#output').html("");

    for (var i = 0; ruleSet[i]; i++) {
        outputArray = "";
        outputArray += (i + " &rarr; ");
        lineLength = (i + '   ').length;
        printRule(ruleSet[i]);

        if (i > 0) {
            for (var j = lineLength; j < 50; j++) {
                outputArray += ('&nbsp;');
            }
            //printRuleExpansion(ruleSet[i]);
        }
        outputArray += ('<br>\n');
        $('#output').append('<span class="rule" id="' + i + '">' + outputArray + '</span>');
    }

}


function getNodes(rule) {
    var rules = [];
    var nodeArray = [];
    for (var symbol = rule.first(); !symbol.isGuard(); symbol = symbol.getNext()) {
        var node = {
            name: "",
            children: []
        };
        if (symbol.getRule()) {
            var ruleNumber;
            if (ruleSet[symbol.getRule().getNumber()] == symbol.getRule()) {
                ruleNumber = symbol.getRule().getNumber();
            } else {
                ruleNumber = ruleSet.length;
                symbol.getRule().setNumber(ruleSet.length);
                ruleSet.push(symbol.getRule());
            }
            if (rules[ruleNumber]) {
                nodeArray.push(rules[ruleNumber]);
            } else {
                node.name = ruleNumber;
                node.children = getNodes(symbol.getRule());
                rules[ruleNumber] = node;
                nodeArray.push(node);
            }

        } else {
            node.name = printTerminal(symbol.value());
            nodeArray.push(node);
        }
    }
    return nodeArray;
}


function printTree(S, showRoot, alignTerminals, depthHeight, terminalDistance, nodeSize) {
    depthHeight = depthHeight ? depthHeight: 100;
    terminalDistance = terminalDistance ? terminalDistance : 20;
    nodeSize = nodeSize ? nodeSize : 7;

    var nodeArray = getNodes(S);
    var time = Date.now();

    var treeStructure = [{
        name: S.number,
        children: nodeArray
    }];

    var jsonString = JSON.stringify(treeStructure);

    var data = JSON.parse(jsonString);
    var getDepth = function (obj) {
        var depth = 0;
        if (obj.children) {
            obj.children.forEach(function (d) {
                var tmpDepth = getDepth(d)
                if (tmpDepth > depth) {
                    depth = tmpDepth
                }
            })
        }
        return 1 + depth;
    };


    var treeDepth = getDepth(treeStructure[0]) - 1;

    // ************** Generate the tree diagram	 *****************
    var width = $('.tree').width(),
        height = $('.tree').height();

    var zoom = d3.behavior.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", zoomed);


    var tree = d3.layout.tree()
        .size([width, height]);

    /*    var diagonal = d3.svg.diagonal()
            .projection(function (d) {
                return [d.x, d.y];
            });
    */

    $('svg').remove();
    var svg = d3.select(".tree").append("svg")
        .attr("id", "tree-svg")
        .append("g")
        .call(zoom);

    svg.append("rect")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all");

    var container = svg.append("g").attr("id", "container").attr("transform", transformSvg);

    function zoomed() {
        transformSvg = "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")";
        container.attr("transform", transformSvg);
    }

    console.log("get tree data: " + (Date.now() - time));
    time = Date.now();
    // load the external data
    var root = data[0];
    update(root);


    function update(source) {
        var nodes = tree.nodes(source);
        // Compute the new tree layout.
        if (!showRoot) {
            nodes = nodes.reverse();
            nodes.pop();
            nodes = nodes.reverse();
        }

        var links = tree.links(nodes);
        var i = 0;

        //align leafs
        nodes.forEach(function (d) {
            d.y = d.depth * depthHeight;
            if (!d.children) {
                if (alignTerminals) {
                    d.y = treeDepth * depthHeight;
                }
                var x = i * terminalDistance;
                d.x = x;
                i++;
            }
        });
        console.log("align leafs: " + (Date.now() - time));
        time = Date.now();

        // align nodes to the middle of their children
        for (var j = treeDepth; j >= 0; j--) {
            nodes.forEach(function (d) {
                if (d.children && d.depth == j) {
                    var childrenCount = d.children.length - 1;
                    var firstChildX = d.children[0].x;
                    var lastChildX = d.children[childrenCount].x;
                    d.x = (Math.max(firstChildX, lastChildX) - Math.min(firstChildX, lastChildX)) / 2 + Math.min(firstChildX, lastChildX);
                    ;
                }

            });
        }

        console.log("align nodes: " + (Date.now() - time));
        time = Date.now();

        // Declare the nodes…
        var node = container.selectAll("g.node")
            .data(nodes, function (d) {
                return d.id || (d.id = ++i);
            });

        // Enter the nodes.
        var nodeEnter = node.enter().append("g")
            .attr("class", function (d) {
                return d.children || d._children ? "node" : "node leaf";
            })
            .attr("transform", function (d) {
                return "translate(" + d.x + "," + d.y + ")";
            });
        console.log("enter nodes: " + (Date.now() - time));
        time = Date.now();

        nodeEnter.append("circle")
            .attr("r", nodeSize) /*function (d) {
                return d.children || d._children ? 10 : 5;
            })*/
            .style("fill", "#fff");

        nodeEnter.append("text")
            .attr("y", 0)/*function (d) {
                return d.children || d._children ? 0 : 15;
            })*/
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .text(function (d) {
                return d.name;
            })
            .style("fill-opacity", 1);
        console.log("append text + circles: " + (Date.now() - time));
        time = Date.now();

        // Declare the links…

        var link = container.selectAll("path.link")
            .data(links, function (d) {
                return d.target.id;
            });

        link.enter().insert("path", "g")
            .attr("class", "link")
            .attr("d", function (d) {
                var path = "M" + d.source.x + " " + (d.source.y + parseInt(nodeSize)) + " V" + (d.source.y + depthHeight / 2)
                    + " H" + d.target.x + " V" + (d.target.y - parseInt(nodeSize));
                return path;
            });

        /*-----This is for bezier-links---
         var link = container.selectAll("path.link")
             .data(links, function (d) {
                 return d.target.id;
             });

         console.log("declare links: " + (Date.now() - time));
         time = Date.now();

         // Enter the links.
         link.enter().insert("path", "g")
             .attr("class", "link")
             .attr("d", diagonal);*/
        console.log("enter links: " + (Date.now() - time));
    }


}

var position = 0;

function saveSvg(svgEl, name) {
    svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    var svgData = svgEl.outerHTML;
    var preface = '<?xml version="1.0" standalone="no"?>\r\n';
    var svgBlob = new Blob([preface, svgData], {type: "image/svg+xml;charset=utf-8"});
    var svgUrl = URL.createObjectURL(svgBlob);
    var downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = name;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function main() {
    var startTime = Date.now();
    digramIndex = {};
    var S = new Rule();
    var input = $('#input').val().split('');
    // $('.progress-bar').width('2%');

    //  setTimeout(function () {
    if (input.length) {
        S.last().insertAfter(new Symbol(input.shift()));
    }

    for (var i = 1; i < position; i++) {
        S.last().insertAfter(new Symbol(input.shift()));
        S.last().getPrev().check();
    }
    // }, 10);

    var processTime = Date.now();
    console.log("Processing Time: " + (processTime - startTime));
    //  $('.progress-bar').width('10%');
    // setTimeout(function () {
    printGrammar(S);
    //  }, 10);
    var printGrammarTime = Date.now();
    console.log("Grammar printing Time: " + (printGrammarTime - processTime));
    if ($('#printTree').is(":checked")) {
        // $('.progress-bar').width('60%');
        //  setTimeout(function () {
        printTree(S, $('#showRoot').is(":checked"), $('#alignTerminals').is(":checked"));
        // },10);
    }
    //  $('.progress-bar').width('100%');
    var printTreeTime = Date.now();
    console.log("Tree printing Time: " + (printTreeTime - printGrammarTime));
    console.log("Time: " + (printTreeTime - startTime));

}