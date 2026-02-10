import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Menu, Grid } from "antd";
import IntlMessage from "../util-components/IntlMessage";
import Icon from "../util-components/Icon";
import navigationConfig from "configs/NavigationConfig";
import { useSelector, useDispatch } from "react-redux";
import { SIDE_NAV_LIGHT, NAV_TYPE_SIDE } from "constants/ThemeConstant";
import utils from "utils";
import { onMobileNavToggle } from "store/slices/themeSlice";

const { useBreakpoint } = Grid;

const setLocale = (localeKey, isLocaleOn = true) =>
	isLocaleOn ? <IntlMessage id={localeKey} /> : localeKey.toString();

const setDefaultOpen = (key) => {
	let keyList = [];
	let keyString = "";
	if (key) {
		const arr = key.split("-");
		for (let index = 0; index < arr.length; index++) {
			const elm = arr[index];
			index === 0 ? (keyString = elm) : (keyString = `${keyString}-${elm}`);
			keyList.push(keyString);
		}
	}
	return keyList;
};

const MenuItem = ({ title, icon, path }) => {

	const dispatch = useDispatch();

	const isMobile = !utils.getBreakPoint(useBreakpoint()).includes("lg");

	const closeMobileNav = () => {
		if (isMobile) {
			dispatch(onMobileNavToggle(false));
		}
	};
	//  bu yerda link kurinish kurinmasligi hal qilinadi 
	return (
		<>
			{icon && <Icon type={icon} />}
			<span>{setLocale(title)}</span>
			{path && <Link onClick={closeMobileNav} to={path} />}
		</>
	);
};

const getSideNavMenuItem = (navItem) =>
	navItem
		.filter(nav => !nav.hidden) // 👈 Faqat hidden: false bo'lganlar
		.map(nav => {
			return {
				key: nav.key,
				role: nav.role,
				label: <MenuItem title={nav.title} {...(nav.isGroupTitle ? {} : { path: nav.path, icon: nav.icon })} />,
				...(nav.isGroupTitle ? { type: "group" } : {}),
				...(nav.submenu.length > 0 ? { children: getSideNavMenuItem(nav.submenu) } : {})
			};
		});


const getTopNavMenuItem = (navItem) =>
	navItem
		.filter(nav => !nav.hidden) // 👈 Faqat ko‘rsatiladiganlar
		.map(nav => {
			return {
				key: nav.key,
				label: <MenuItem title={nav.title} icon={nav.icon} {...(nav.isGroupTitle ? {} : { path: nav.path })} />,
				...(nav.submenu.length > 0 ? { children: getTopNavMenuItem(nav.submenu) } : {})
			};
		});


const filterWithRole = (navList, user) => {
	return navList
		.filter((item) => {
			if (item.hidden) return false; // 👈 Avval yashirin bo‘lsa, o‘tkazib yubor
			if (item.role) return item.role.includes(user.role);
			return true;
		})
		.map(item => {
			if (item.children?.length > 0) {
				item.children = item.children
					.filter((subItem) => {
						if (subItem.hidden) return false; // 👈 Submenu uchun ham
						if (subItem.role) return subItem.role.includes(user.role);
						return true;
					})
					.map(sub => {
						if (sub.children?.length > 0) {
							sub.children = sub.children.filter((subSubItem) => {
								if (subSubItem.hidden) return false;
								if (subSubItem.role) return subSubItem.role.includes(user.role);
								return true;
							});
						}
						return sub;
					});
			}
			return item;
		});
};


const SideNavContent = (props) => {

	const { routeInfo, hideGroupTitle, sideNavTheme = SIDE_NAV_LIGHT } = props;

	const user = useSelector(state => state.auth);
	const menuItems = useMemo(() => { return filterWithRole(getSideNavMenuItem(navigationConfig), user); }, [user]);

	return (
		<Menu
			mode="inline"
			theme={sideNavTheme === SIDE_NAV_LIGHT ? "light" : "dark"}
			style={{ height: "100%", borderInlineEnd: 0 }}
			defaultSelectedKeys={[routeInfo?.key]}
			defaultOpenKeys={setDefaultOpen(routeInfo?.key)}
			className={hideGroupTitle ? "hide-group-title" : ""}
			items={menuItems}
		/>
	);
};

const TopNavContent = () => {

	const topNavColor = useSelector(state => state.theme.topNavColor);

	const menuItems = useMemo(() => getTopNavMenuItem(navigationConfig), []);

	return (
		<Menu
			mode="horizontal"
			style={{ backgroundColor: topNavColor }}
			items={menuItems}
		/>
	);
};

const MenuContent = (props) => {
	return props.type === NAV_TYPE_SIDE ? (
		<SideNavContent {...props} />
	) : (
		<TopNavContent {...props} />
	);
};

export default MenuContent;
