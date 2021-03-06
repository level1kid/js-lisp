var fs = require("fs")
var functions = require("./lang/functions.js");
var types = require("./lang/types.js");

var rgx = {
	symbol: /^[\w_+-]+$/,
	number: /^-?\d+$/,
	whitespace: /[\s,]+(?=(?:[^"\\]*(?:\\.|"(?:[^"\\]*\\.)*[^"\\]*"))*[^"]*$)/,
	string: /^".*"$/,
	block: /\((.+)\)/,
	allEol: /(;.*)?\n/g,
	allParens: /([\(\)])/g
}

var keywords = [
	"def",
	"print",
	"do",
	"fn",
	"let",
	"if",
	"or",
	"and",
	"not",
	"+",
	"-",
	"*",
	"/",
	"<",
	">"
]

var escapes = {
	"\\": "\\",
	"\"": "\"",
	"'": "'",
	"n": "\n",
	"t": "\t"
}

function read(tokens) {
	if (tokens.length == 0)
		throw new Error("EOF while reading")
	t = tokens.shift()
	if (t == "(") {
		var list = []
		var next = tokens[0]
		while (next != ")") {
			list.push(read(tokens))
			next = tokens[0]
		}
		tokens.shift()
		return list
	} else if (t == ")") {
		// console.log(tree)
		throw new Error("unmatched right paren")
	} else {
		if (rgx.number.test(t)) {
			return parseInt(t)
		} else if (rgx.string.test(t)) {
			var str = t.substring(1, t.length - 1);

			// backslash substitutions
			var pos = 0;
			var parts = [];
			for (var i = 0; i < str.length; i++) {
				var c = str.charAt(i);
				if (c === "\\") {
					parts.push(str.substring(pos, i));

					var c2 = str.charAt(i+1);
					if (c2 == "x") {
						var code = parseInt("0" + str.substring(i+1, i+4));
						parts.push(String.fromCharCode(code));
						pos = i + 4;
						i += 3;
					} else {
						var sub = escapes[c2];
						if (sub == undefined)
							throw new Error("invalid escape sequence '\\" + c2
									+ "'");
						parts.push(sub);
						pos = i + 2;
						i++; // extra char consumed
					}
				}
			}
			if (pos != str.length) {
				parts.push(str.substring(pos, str.length));
			}

			return parts.join("");
		} else if (t == "true") {
			return true
		} else if (t == "false") {
			return false
		} else if (rgx.symbol.test(t) || keywords.indexOf(t) >= 0) {
			return new types.Symbol(t)
		} else {
			throw new Error("invalid token: " + t)
		}
	}
	
}

function parse(src) {
	src = "(do " + src + ")"
	src = src
			.replace(rgx.allEol, " ")
			.replace(rgx.allParens, " $& ")
	var tokens = src.split(rgx.whitespace)
			.filter(function(t) {return t != ''})
	var tree = read(tokens)	
	return tree
}

function exec(tree, env) {
	if (Array.isArray(tree)) {
		var first = tree[0]
		var args = tree.slice(1)

		if (!types.isType(first, types.Symbol)) {
			if (Array.isArray(first)) {
				var proc = exec(first, env);

				if (types.isType(proc, types.Proc)) {
					return invoke(proc, args, env);
				}
			}
			throw new Error("first element of block must be a symbol or proc")
		}

		if (keywords.indexOf(first.name) != -1) {
			return functions[first.name](exec, env, args);
		} else {
			var proc = env[first.name]
			if (proc === undefined)
				throw new Error("proc not found for symbol: " + first.name)
			if (!types.isType(proc, types.Proc))
				throw new Error("symbol: " + first.name + " is not a proc")
			if (proc.args.length != args.length)
				throw new Error("invalid arg count")

			return invoke(proc, args, env);
		}
	} else if (types.isType(tree, types.Symbol)) {
		var ret = env[tree.name]
		if (ret === undefined)
			throw new Error("value not found for symbol: " + tree.name)
		return ret
	} else {
		return tree
	}
}

function invoke(f, args, scope) {
	// eval args using current scope and place them into the function's scope
	var newScope = Object.create(f.scope);
	f.args.forEach(function(argname, n) {
		newScope[argname] = exec(args[n], scope);
	});

	return exec(f.tree, newScope);
}

var stdlib = {}
exec(parse(fs.readFileSync("./stdlib.l", {encoding:"utf-8"})), stdlib)

function newGlobalScope() {
	var gs = Object.create(stdlib)
	return gs
}

exports.parse = parse
exports.exec = exec
exports.stdlib = stdlib
exports.newGlobalScope = newGlobalScope