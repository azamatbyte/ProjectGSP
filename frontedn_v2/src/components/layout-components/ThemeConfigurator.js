import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Radio, Switch } from "antd";
import { useTranslation } from "react-i18next";
import { 
	toggleCollapsedNav, 
	onNavTypeChange,
	onNavStyleChange,
	onTopNavColorChange,
	onHeaderNavColorChange,
	onSwitchTheme,
	onDirectionChange
} from "store/slices/themeSlice";
import ColorPicker from "components/shared-components/ColorPicker";
import NavLanguage from "./NavLanguage";
import { 
	SIDE_NAV_LIGHT,
	NAV_TYPE_SIDE,
	NAV_TYPE_TOP,
	SIDE_NAV_DARK,
	DIR_RTL,
	DIR_LTR
} from "constants/ThemeConstant";
import { useThemeSwitcher } from "react-css-theme-switcher";
import utils from "utils/index";
import { useTheme } from "utils/hooks/useTheme";

const colorOptions = [
	"#3e82f7",
	"#24a772",
	"#de4436",
	"#924aca",
	"#193550"
];

const ListOption = ({name, selector, disabled, vertical}) => (
	<div className={`my-4 ${vertical? "" : "d-flex align-items-center justify-content-between"}`}>
		<div className={`${disabled ? "opacity-0-3" : ""} ${vertical? "mb-3" : ""}`}>{name}</div>
		<div>{selector}</div>
	</div>
);

export const ThemeConfigurator = () => {
	const dispatch = useDispatch();
	const { t } = useTranslation();
	
	// Add your custom theme hook
	const { theme: currentSystemTheme, changeTheme, isSystemTheme } = useTheme();

	const { 
		navType, 
		sideNavTheme, 
		navCollapsed, 
		topNavColor, 
		headerNavColor, 
		currentTheme, 
		direction 
	} = useSelector(state => state.theme);

	const isNavTop = navType === NAV_TYPE_TOP;
	const isCollapse = navCollapsed; 

	const { switcher, themes } = useThemeSwitcher();

	// Modified toggleTheme function
	const toggleTheme = (isChecked) => {
		onHeaderNavColorChange("");
		const changedTheme = isChecked ? "dark" : "light";
		
		// Update both Redux store and your custom theme hook
		dispatch(onSwitchTheme(changedTheme));
		changeTheme(changedTheme); // This handles localStorage and system detection
		
		// Apply the theme via react-css-theme-switcher
		switcher({ theme: themes[changedTheme] });
	};

	const ontopNavColorClick = (value) => {
		dispatch(onHeaderNavColorChange(""));
		const { rgb } = value;
		const rgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a})`;
		const hex = utils.rgbaToHex(rgba);
		dispatch(onTopNavColorChange(hex));
	};

	const onHeaderNavColorClick = (value) => {
		const { rgb } = value;
		const rgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a})`;
		const hex = utils.rgbaToHex(rgba);
		dispatch(onHeaderNavColorChange(hex));
	};

	const onNavTypeClick = (value) => {
		dispatch(onHeaderNavColorChange(""));
		if(value === NAV_TYPE_TOP) {
			onTopNavColorChange(colorOptions[0]);
			toggleCollapsedNav(false);
		}
		dispatch(onNavTypeChange(value));
	};

	const haddleNavStyleChange = (style) => {
		dispatch(onNavStyleChange(style));
	};

	const handleToggleCollapseNav = () => {
		dispatch(toggleCollapsedNav(!navCollapsed));
	};

	const handleDirectionChange = (dir) => {
		dispatch(onDirectionChange(dir));
	};

	return (
		<>
			<div className="mb-5">
				<h4 className="mb-3 font-weight-bold">Navigation</h4>
				{
					isNavTop ?
					<ListOption 
						name="Top Nav Color:"
						vertical
						selector={
							<ColorPicker color={topNavColor} colorChange={ontopNavColorClick}/>
						}
					/>
					:
					<ListOption 
						name="Header Nav Color:"
						vertical
						selector={
							<ColorPicker color={headerNavColor} colorChange={onHeaderNavColorClick}/>
						}
					/>
				}
				
				<ListOption 
					name="Navigation Type:"
					selector={
						<Radio.Group 
							size="small" 
							onChange={e => onNavTypeClick(e.target.value)} 
							value={navType}
						>
							<Radio.Button value={NAV_TYPE_SIDE}>Side</Radio.Button>
							<Radio.Button value={NAV_TYPE_TOP}>Top</Radio.Button>
						</Radio.Group>
					}
				/>
				<ListOption 
					name="Side Nav Color:"
					selector={
						<Radio.Group
							disabled={isNavTop}
							size="small" 
							onChange={e => haddleNavStyleChange(e.target.value)} 
							value={sideNavTheme}
						>
							<Radio.Button value={SIDE_NAV_LIGHT}>Light</Radio.Button>
							<Radio.Button value={SIDE_NAV_DARK}>Dark</Radio.Button>
						</Radio.Group>
					}
					disabled={isNavTop}
				/>
				<ListOption 
					name="Side Nav Collapse:"
					selector={
						<Switch 
							disabled={isNavTop} 
							checked={isCollapse} 
							onChange={handleToggleCollapseNav} 
						/>
					}
					disabled={isNavTop}
				/>
				<ListOption 
					name="Dark Theme:"
					selector={
						<div>
							<Switch 
								checked={currentTheme === "dark" || currentSystemTheme === "dark"} 
								onChange={toggleTheme} 
							/>
							{isSystemTheme && (
								<div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
									{t("following_system_theme")}
								</div>
							)}
						</div>
					}
				/>
				<ListOption 
					name="Direction:"
					selector={
						<Radio.Group
							size="small" 
							onChange={e => handleDirectionChange(e.target.value)} 
							value={direction}
						>
							<Radio.Button value={DIR_LTR}>LTR</Radio.Button>
							<Radio.Button value={DIR_RTL}>RTL</Radio.Button>
						</Radio.Group>
					}
				/>
			</div>
			<div className="mb-5">
				<h4 className="mb-3 font-weight-bold">Locale</h4>
				<ListOption 
					name="Language:"
					selector={
						<NavLanguage configDisplay/>
					}
				/>
			</div>
		</>
	);
};

export default ThemeConfigurator;