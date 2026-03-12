import React, { Component } from "react";
import { useLocation } from "react-router-dom";
import { Breadcrumb } from "antd";
import navigationConfig from "configs/NavigationConfig";
import IntlMessage from "components/util-components/IntlMessage";
import { GuardedLink } from "utils/hooks/useUnsavedChangesGuard";

let breadcrumbData = { 
	"/app" : <IntlMessage id="Dashboard" />
};

navigationConfig.forEach((elm, i) => {
	const assignBreadcrumb = (obj) => breadcrumbData[obj.path] = <IntlMessage id={obj.title} />;
	assignBreadcrumb(elm);
	if (elm.submenu) {
		elm.submenu.forEach( elm => {
			assignBreadcrumb(elm);
			if(elm.submenu) {
				elm.submenu.forEach( elm => {
					assignBreadcrumb(elm);
				});
			}
		});
	}
});

const BreadcrumbRoute = props => {
	const location = useLocation();
	const pathSnippets = location.pathname.split("/").filter(i => i);
	const breadcrumbItems = pathSnippets.map((_, index) => {
		const url = `/${pathSnippets.slice(0, index + 1).join("/")}`;
		return {
			title: <GuardedLink to={url}>{breadcrumbData[url]}</GuardedLink>
		};
	});
  
	return (
		<Breadcrumb items={breadcrumbItems} />
	);
};

export class AppBreadcrumb extends Component {
	render() {
		return (
			<BreadcrumbRoute />
		);
	}
}

export default AppBreadcrumb;
