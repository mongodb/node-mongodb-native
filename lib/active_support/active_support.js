/**
 * ActiveSupport for JavaScript library, version '0.1'
 * (c) 2007 Nicolas Sanguinetti
 *
 * ActiveSupport for JavaScript is freely distributable under the terms of an
 * MIT-style license. For details, see our web site:
 *   http://code.google.com/p/active-support-for-javascript/
 *
 */

var ActiveSupport = {
	Version: '0.1',

	pluralizeMethods: function(module) {
		$H(module).each(function(pair) {
			module[pair.first().pluralize()] = module[pair.first()];
		});
	},
	pluralize: function(count, singular) {
		return count.abs() == 1 ? count + " " + singular : count + " " + singular.pluralize();
	}
}

window.pluralize = ActiveSupport.pluralize;


// String Interpolation

var InterpolatableString = Class.create();
InterpolatableString.prototype = {
	initialize: function(string, binding) {
		this.string = string;
		this.tokens = (string.match(/#{([^}]+)}/ig) || []).map(function(token) {
			return new InterpolatableString.Token(token, binding);
		});
	},
	toString: function() {
		return this.tokens.inject(this.string.toString(), function(result, token) {
			return result.gsub(token.toRegExp(), token.evaluate()).toString();
		}.bind(this));
	}
};

InterpolatableString.Token = Class.create();
InterpolatableString.Token.prototype = {
	initialize: function(token, binding) {
		this.token = token.replace(/^#{(.*)}$/, "$1");
		this.binding = binding;
	},
	toRegExp: function() {
		var token = ("#{" + this.token + "}").replace(/\(/, "\\(").replace(/\)/, "\\)").replace(/\[/, "\\[").replace(/\]/, "\\]").replace(/\./, "\\.").replace(/\-/, "\\-");
		return new RegExp(token, "i");
	},
	evaluate: function() {
		var token = this.token;
		return (function() { return eval(token); }.bind(this.binding))();
	}
};

var $Q = function(string, binding) {
	return string.interpolate(binding || window);
};

// Inflector

var Inflector = {
	pluralize: function(word) {
		if (Inflections.uncountables.include(word.toLowerCase()))
			return word;
		return Inflections.plurals.map(function(pair) {
			return word.replace(pair.first(), pair.last());
		}).detect(function(plural) { return word != plural; }) || word;
	},
	singularize: function(word) {
		if (Inflections.uncountables.include(word.toLowerCase()))
			return word;
		return Inflections.singulars.map(function(pair) {
			return word.replace(pair.first(), pair.last());
		}).detect(function(singular) { return word != singular; }) || word;
	},
	ordinalize: function(number) {
		if ($R(11, 13).include(number % 100)) {
			return number + "th";
		}
		switch (number % 10) {
			case 1: return number + "st";
			case 2: return number + "nd";
			case 3: return number + "rd";
			default: return number + "th";
		}
	}
};

var Inflections = {
	plurals: [],
	singulars: [],
	uncountables: [],

	plural: function(rule, replacement) {
		this.plurals.unshift([rule, replacement]);
	},
	singular: function(rule, replacement) {
		this.singulars.unshift([rule, replacement]);
	},
	irregular: function(singular, plural) {
		this.plural(new RegExp(singular.charAt(0) + singular.substring(1) + "$", "i"), "$1" + plural.substring(1));
		this.singular(new RegExp(plural.charAt(0) + plural.substring(1) + "$", "i"), "$1" + singular.substring(1));
	},
	uncountable: function(uncountable) {
		this.uncountables = this.uncountables.concat($A(arguments));
	}
};

with (Inflections) {
	plural(/$/, "s");
	plural(/s$/i, "s");
	plural(/(ax|test)is$/i, "$1es");
	plural(/(octop|vir)us$/i, "$1i");
	plural(/(alias|status)$/i, "$1es");
	plural(/(bu)s$/i, "$1ses");
	plural(/(buffal|tomat)o$/i, "$1oes");
	plural(/([ti])um$/i, "$1a");
	plural(/sis$/i, "ses");
	plural(/(?:([^f])fe|([lr])f)$/i, "$1$2ves");
	plural(/(hive)$/i, "$1s");
	plural(/([^aeiouy]|qu)y$/i, "$1ies");
	plural(/([^aeiouy]|qu)ies$/i, "$1y");
	plural(/(x|ch|ss|sh)$/i, "$1es");
	plural(/(matr|vert|ind)ix|ex$/i, "$1ices");
	plural(/([m|l])ouse$/i, "$1ice");
	plural(/^(ox)$/i, "$1en");
	plural(/(quiz)$/i, "$1zes");

	singular(/s$/i, '');
	singular(/(n)ews$/i, '$1ews');
	singular(/([ti])a$/i, '$1um');
	singular(/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$/i, '$1$2sis');
	singular(/(^analy)ses$/i, '$1sis');
	singular(/([^f])ves$/i, '$1fe');
	singular(/(hive)s$/i, '$1');
	singular(/(tive)s$/i, '$1');
	singular(/([lr])ves$/i, '$1f');
	singular(/([^aeiouy]|qu)ies$/i, '$1y');
	singular(/(s)eries$/i, '$1eries');
	singular(/(m)ovies$/i, '$1ovie');
	singular(/(x|ch|ss|sh)es$/i, '$1');
	singular(/([m|l])ice$/i, '$1ouse');
	singular(/(bus)es$/i, '$1');
	singular(/(o)es$/i, '$1');
	singular(/(shoe)s$/i, '$1');
	singular(/(cris|ax|test)es$/i, '$1is');
	singular(/([octop|vir])i$/i, '$1us');
	singular(/(alias|status)es$/i, '$1');
	singular(/^(ox)en/i, '$1');
	singular(/(vert|ind)ices$/i, '$1ex');
	singular(/(matr)ices$/i, '$1ix');
	singular(/(quiz)zes$/i, '$1');

	irregular("person", "people");
	irregular("man", "men");
	irregular("child", "children");
	irregular("sex", "sexes");
	irregular("move", "moves");

	uncountable("equipment", "information", "rice", "money", "species", "series", "fish", "sheep");
};

// String Extensions

Object.extend(String.prototype, {
	interpolate: function(binding) {
		return new InterpolatableString(this, binding || window).toString();
	},
	pluralize: function() {
		return Inflector.pluralize(this.toString());
	},
	singularize: function() {
		return Inflector.singularize(this.toString());
	}
});

// Array Extensions

Array.prototype.toSentence = function() {
	var options = Object.extend({
		"connector": "and",
		"skip_last_comma": false
	}, arguments[0] || {});

	switch (this.size()) {
		case 0: return "";
		case 1: return this.reduce();
		case 2: return $Q("#{this.first()} #{options['connector']} #{this.last()}", this);
		default: return $Q("#{this.slice(0, -1).join(', ')}#{options['skip_last_comma'] ? '' : ','} #{options['connector']} #{this.last()}", this);
	}
};

// Number Extensions

$w("abs acos asin atan ceil cos exp floor log pow round sin sqrt tan").each(function(method) {
	Number.prototype[method] = Math[method].methodize();
});

Object.extend(Number.prototype, {
	ordinalize: function() {
		return Inflector.ordinalize(this);
	}
});

Number.ByteExtensions = {
	byte:     function() { return this; },
	kilobyte: function() { return this * 1024; },
	megabyte: function() { return this * (1024).kilobytes(); },
	gigabyte: function() { return this * (1024).megabytes(); },
	terabyte: function() { return this * (1024).gigabytes(); },
	petabyte: function() { return this * (1024).terabytes(); },
	exabyte:  function() { return this * (1024).petabytes(); }
};
ActiveSupport.pluralizeMethods(Number.ByteExtensions);
Object.extend(Number.prototype, Number.ByteExtensions);

Number.IntervalExtensions = {
  second:    function() { return this * 1000; },
  minute:    function() { return this.seconds() * 60; },
  hour:      function() { return this.minutes() * 60; },
  day:       function() { return this.hours() * 24; },
  week:      function() { return this.days() * 7; },
	fortnight: function() { return this.weeks() * 2; },
	month:     function() { return this.days() * 30; },
	year:      function() { return this.months() * 12 }
};
ActiveSupport.pluralizeMethods(Number.IntervalExtensions);
Object.extend(Number.prototype, Number.IntervalExtensions);

Number.TimeExtensions = {
  since: function(reference) { return new Date((reference || new Date()).getTime() + this); },
  until: function(reference) { return new Date((reference || new Date()).getTime() - this); }
};
Number.TimeExtensions.toDate = (0).ago;
Number.TimeExtensions.fromNow = Number.TimeExtensions.since.curry(null);
Number.TimeExtensions.ago = Number.TimeExtensions.until.curry(null);
Object.extend(Number.prototype, Number.TimeExtensions);

// Date Extensions

Object.extend(Date, {
  MONTHS: $w("January February March April May June July August September October November December"),
  ABBR_MONTHS: $w("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec"),
  WEEKDAYS: $w("Sunday Monday Tuesday Wednesday Thursday Friday Saturday"),
  ABBR_WEEKDAYS: $w("Sun Mon Tue Wed Thu Fri Sat"),
	RELATIVE_DATE_OUTPUT: {
		today: "today",
		yesterday: "yesterday",
		tomorrow: "tomorrow",
		hour_format: "%H:%M, ",
		date_format: "%b %o",
		year_format: ", %Y"
	},
	RELATIVE_TIME_RANGES: {
		0:  "less than a minute",
		15: "#{pluralize(this, 'minute')}",
		25: "less than half an hour",
		35: "about half an hour",
		55: "less than an hour",
		65: "about an hour",
		85: "less than an hour and a half",
		95: "about an hour and a half",
		115: "less than 2 hours",
		125: "about 2 hours",
		145: "less than 2 hours and a half",
		155: "about 2 hours and a half",
		175: "less than 3 hours",
		185: "around 3 hours"
	},
  STRING_FORMATS: {
		"%a": function() { return Date.ABBR_WEEKDAYS[this.getDay()]; },
		"%A": function() { return Date.WEEKDAYS[this.getDay()]; },
		"%b": function() { return Date.ABBR_MONTHS[this.getMonth()]; },
		"%B": function() { return Date.MONTHS[this.getMonth()]; },
		"%c": function() { return this.toLocaleString(); },
		"%d": function() { return this.getDate().toPaddedString(2); },
	  "%H": function() { return this.getHours().toPaddedString(2); },
	  "%I": function() { return (this.getHours() % 12).toPaddedString(2); },
		"%j": function() { throw Error("not implemented"); },
	  "%m": function() { return (this.getMonth() + 1).toPaddedString(2); },
	  "%M": function() { return this.getMinutes().toPaddedString(2); },
		"%o": function() { return this.getDate().ordinalize(); },
	  "%p": function() { return Math.floor(this.getHour() / 12) == 0 ? "AM" : "PM"; },
	  "%S": function() { return this.getSeconds().toPaddedString(2); },
		"%U": function() { throw Error("not implemented"); },
		"%W": function() { throw Error("not implemented"); },
		"%w": function() { return this.getDay(); },
		"%x": function() { throw Error("not implemented"); },
		"%X": function() { throw Error("not implemented"); },
	  "%y": function() { return this.getYear().toPaddedString(2); },
	  "%Y": function() { return this.getFullYear().toPaddedString(4); },
		"%Z": function() { throw Error("not implemented"); }
	},
	now: function() {
		return new Date();
	},
	today: function() {
		return new Date().atBeginningOfDay();
	}
});

Object.extend(Date.prototype, {
  equals: function(otherDate) {
    return this.getFullYear() == otherDate.getFullYear() && this.getMonth() == otherDate.getMonth() && this.getDate() == otherDate.getDate();
  },
  isLeapYear: function() {
    var year = this.getFullYear();
    return (year % 4 == 0 && year % 100 != 0) || year % 400;
  },
  getMonthName: function() {
    return Date.MONTHS[this.getMonth()];
  },
  getDaysInMonth: function() {
    switch (this.getMonth() + 1) {
      case 2:
        return this.isLeapYear() ? 29 : 28;
      case 4:
      case 6:
      case 9:
      case 11:
        return 30;
      default:
        return 31;
    }
  },
  isToday: function() {
    return this.midnight().equals(new Date().midnight());
  },
	succ: function() {
		return (1).second().fromNow();
	},
  toFormattedString: function(format) {
    return format.gsub(/%[a-zA-Z]/, function(pattern) {
      return Date.STRING_FORMATS[pattern].bind(this)().toString();
    }.bind(this)).replace(/%%/, "%");
  },
	relativeDate: function() {
		var targetTime = this.atBeginningOfDay();
		var today = Date.today();

		if (targetTime.equals(today)) {
			return Date.RELATIVE_DATE_OUTPUT["today"];
		} else if (targetTime.equals(today.yesterday())) {
			return Date.RELATIVE_DATE_OUTPUT["yesterday"];
		} else if (targetTime.equals(today.tomorrow())) {
			return Date.RELATIVE_DATE_OUTPUT["tomorrow"];
		} else {
			var format = Date.RELATIVE_DATE_OUTPUT["date_format"];
			format += targetTime.getFullYear() == today.getFullYear() ? "" : Date.RELATIVE_DATE_OUTPUT["year_format"];
			return this.strftime(format);
		}
	},
	relativeTime: function() {
		var options = Object.extend({ prefix: "", suffix: "" }, arguments[0] || {});
		var distanceInMinutes = ((Date.now().getTime() - this.getTime()).abs() / 60000).round();
		return $H(Date.RELATIVE_TIME_RANGES).map(function(pair) {
			return (distanceInMinutes <= pair.first()) ?
				(options["prefix"] + " " + $Q(pair.last(), distanceInMinutes) + " " + options["suffix"]).strip() : false;
		}).find(Prototype.K) || $Q("#{this.relativeDate()} at #{this.strftime('%H:%M')}", this);
	},
	since: function(seconds) {
	 	return seconds.since(this);
	},
	ago: function(seconds) {
		return this.since(-seconds);
	},
	beginningOfDay: function() {
		return new Date(this).setHours(0).setMinutes(0).setSeconds(0);
	},
	beginningOfWeek: function() {
		var daysToSunday = this.getDay() == 0 ? 6 : this.getDay() - 1;
		return daysToSunday.days().until(this.beginningOfDay());
	},
	beginningOfMonth: function() {
		return this.beginningOfDay().setDate(1);
	},
	beginningOfQuarter: function() {
		return this.beginningOfMonth().setMonth([9, 6, 3, 0].detect(function(m) { return m <= this.getMonth(); }.bind(this)));
	},
	beginningOfYear: function() {
		return this.beginningOfMonth().setMonth(0);
	},
	endOfDay: function() {
		return new Date(this).setHours(23).setMinutes(59).setSeconds(59);
	},
	endOfMonth: function() {
		return this.beginningOfDay().setDate(this.getDaysInMonth());
	},
	endOfQuarter: function() {
		return this.setMonth([2, 5, 8, 11].detect(function(m) { return m >= this.getMonth(); }.bind(this))).endOfMonth();
	},
	yesterday: function() {
		return this.setDate(this.getDate() - 1);
	},
	tomorrow: function() {
		return this.setDate(this.getDate() + 1);
	}
});

$w("setDate setMonth setFullYear setYear setHours setMinutes setSeconds setMilliseconds setTime").each(function(method) {
	Date.prototype[method + "WithoutChaining"] = Date.prototype[method];
	Date.prototype[method] = function() {
		this[method + "WithoutChaining"].call(this, $A(arguments));
		return this;
	}
});

$w("beginningOfDay beginningOfWeek beginningOfMonth beginningOfQuarter beginningOfYear endOfDay endOfMonth endOfQuarter").each(function(method) {
	Date.prototype["at" + method.charAt(0).toUpperCase() + method.substring(1)] = Date.prototype[method];
});

Date.prototype.strftime = Date.prototype.toFormattedString;
Date.prototype.midnight = Date.prototype.beginningOfDay;
Date.prototype.monday = Date.prototype.beginningOfWeek;

Date.WEEKDAYS.each(function(dayName, dayIndex) {
  Date.prototype["is" + dayName] = function() {
    return this.getDay() % 7 == dayIndex;
  }
});