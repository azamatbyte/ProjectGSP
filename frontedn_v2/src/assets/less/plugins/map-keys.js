const less = require("less");

less.functions.add("map-keys", function ({ ruleset: { rules } } = { ruleset: { rules: [] } }) {
	const keys = [];

	rules.forEach(rule => {
		// Not exactly sure how to handle other types (or if they should be handled at all).
		if (! (rule instanceof less.tree.Declaration))
			return;

		const { name: key } = rule.eval(this.context);

		keys.push(new less.tree.Anonymous(key));
	});

	return new less.tree.Value(keys);
});

module.exports = {
	install: function(less, pluginManager) {
		// Plugin installation logic if needed
	}
};
