/** @jsxImportSource @emotion/react */
import { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { TEMPLATE } from "constants/ThemeConstant";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import Logo from "../Logo";
import NavProfile from "../NavProfile";
import NavLanguage from "../NavLanguage";
import NavPanel from "../NavPanel";
import NavSearch from "../NavSearch";
import Header from "./Header";
import HeaderWrapper from "./HeaderWrapper";
import Nav from "./Nav";
import NavEdge from "./NavEdge";
import NavItem from "../NavItem";
import { toggleCollapsedNav, onMobileNavToggle } from "store/slices/themeSlice";
import { NAV_TYPE_TOP, SIDE_NAV_COLLAPSED_WIDTH, SIDE_NAV_WIDTH } from "constants/ThemeConstant";
import utils from "utils";
import NavOrder from "../NavOrder";
import NavReserve from "../NavReserve";
import NavConclusion from "../NavConclusion";
import ProviderComponent from "providerComponent";
import NavBackup from "../NavBackup";
import NavMigration from "../NavMigration";
import NavActionsMenu from "../NavActionsMenu";

export const HeaderNav = props => {

	const { isMobile } = props;

	const [searchActive, setSearchActive] = useState(false);

	const dispatch = useDispatch();

	const navCollapsed = useSelector(state => state.theme.navCollapsed);
	const mobileNav = useSelector(state => state.theme.mobileNav);
	const navType = useSelector(state => state.theme.navType);
	const headerNavColor = useSelector(state => state.theme.headerNavColor);
	const currentTheme = useSelector(state => state.theme.currentTheme);
	const direction = useSelector(state => state.theme.direction);
	const uploadData = useSelector(state => state.uploadData);
	const user = useSelector(state => state.auth.user);

	const onSearchActive = () => {
		setSearchActive(true);
	};

	const onSearchClose = () => {
		setSearchActive(false);
	};

	const onToggle = () => {
		if (!isMobile) {
			dispatch(toggleCollapsedNav(!navCollapsed));
		} else {
			dispatch(onMobileNavToggle(!mobileNav));
		}
	};

	const isNavTop = navType === NAV_TYPE_TOP;
	const isDarkTheme = currentTheme === "dark";

	const navMode = useMemo(() => {
		if (!headerNavColor) {
			return utils.getColorContrast(isDarkTheme ? "#000000" : "#ffffff");
		}
		return utils.getColorContrast(headerNavColor);
	}, [isDarkTheme, headerNavColor]);

	// navModeBackUp removed — duplicate of navMode and unused

	const navBgColor = isDarkTheme ? TEMPLATE.HEADER_BG_DEFAULT_COLOR_DARK : TEMPLATE.HEADER_BG_DEFAULT_COLOR_LIGHT;

	const getNavWidth = () => {
		if (isNavTop || isMobile) {
			return "0px";
		}
		if (navCollapsed) {
			return `${SIDE_NAV_COLLAPSED_WIDTH}px`;
		} else {
			return `${SIDE_NAV_WIDTH}px`;
		}
	};

	useEffect(() => {
		if (!isMobile) {
			onSearchClose();
		}
	});

	return (
		<Header isDarkTheme={isDarkTheme} headerNavColor={headerNavColor || navBgColor}>
			{uploadData?.loading && <div className="skeleton-div" style={{ position: "fixed", top: 0 }}></div>}
			<HeaderWrapper isNavTop={isNavTop}>
				<Logo logoType={navMode} />
				<Nav navWidth={getNavWidth()}>
					<NavEdge left>
						{
							isNavTop && !isMobile ? null : (
								<NavItem onClick={onToggle} mode={navMode}>
									<div className="d-flex align-items-center">
										{navCollapsed || isMobile ? <MenuUnfoldOutlined className="nav-icon" /> : <MenuFoldOutlined className="nav-icon" />}
									</div>
								</NavItem>
							)
						}
						{isMobile ?
							<div className="ant-menu-item ant-menu-item-only-child" onClick={() => { onSearchActive(); }}>
								{/* <SearchOutlined /> */}
							</div>
							:
							<div className="ant-menu-item ant-menu-item-only-child" style={{ cursor: "auto" }}>
								{/* <SearchInput mode={navMode} isMobile={isMobile} /> */}
							</div>
						}
					</NavEdge>
					{!isMobile && (
						<NavEdge left>
							<ProviderComponent rolePermission={["superAdmin"]}>
								<NavBackup />
							</ProviderComponent>
							{user?.username === "admin01" && <NavMigration />}
						</NavEdge>
					)}

					<NavEdge right>
						{isMobile ? (
							<NavActionsMenu mode={navMode} />
						) : (
							<>
								<NavConclusion mode={navMode} />
								<NavOrder mode={navMode} />
								<NavReserve mode={navMode} />
							</>
						)}
						<NavLanguage mode={navMode} />
						<NavPanel direction={direction} mode={navMode} />
						<NavProfile mode={navMode} />
					</NavEdge>

					<NavSearch
						active={searchActive}
						close={onSearchClose}
						headerNavColor={headerNavColor}
						currentTheme={currentTheme}
						mode={navMode}
					/>
				</Nav>
			</HeaderWrapper>
		</Header>
	);
};

export default HeaderNav;
