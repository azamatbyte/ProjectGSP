import React from "react";
import { Dropdown, Avatar } from "antd";
import { useDispatch, useSelector } from "react-redux";
import {
	LogoutOutlined,
	UserOutlined
} from "@ant-design/icons";
import NavItem from "./NavItem";
import Flex from "components/shared-components/Flex";
import { signOut } from "store/slices/authSlice";
import styled from "@emotion/styled";
import { FONT_WEIGHT, MEDIA_QUERIES, SPACER, FONT_SIZES } from "constants/ThemeConstant";
import { clearStorage } from "utils/storage";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";


const Icon = styled.div(() => ({
	fontSize: FONT_SIZES.LG
}));

const Profile = styled.div(() => ({
	display: "flex",
	alignItems: "center"
}));

const UserInfo = styled("div")`
	padding-left: ${SPACER[2]};

	@media ${MEDIA_QUERIES.MOBILE} {
		display: none
	}
`;

const Name = styled.div(() => ({
	fontWeight: FONT_WEIGHT.SEMIBOLD
}));

const Title = styled.span(() => ({
	opacity: 0.8
}));

const MenuItemSignOut = (props) => {
	const dispatch = useDispatch();
	const navigate = useNavigate();

	const handleSignOut = () => {
		dispatch(signOut());
		clearStorage();
		localStorage.removeItem("user");
		navigate("/login");
	};

	return (
		<div onClick={handleSignOut}>
			<Flex alignItems="center" gap={SPACER[2]}>
				<Icon>
					<LogoutOutlined />
				</Icon>
				<span>{props.label}</span>
			</Flex>
		</div>
	);
};



export const NavProfile = ({ mode }) => {
	const { user } = useSelector((state) => state.auth);
	const { t } = useTranslation();  // 👉 qo'shildi

	return (
		<Dropdown placement="bottomRight" menu={{ items: [
			{
				key: "Sign Out",
				label: <MenuItemSignOut label={t("sign_out")} />
			}
		] }} trigger={["click"]}>
			<NavItem mode={mode}>
				<Profile>
					{user?.photo && user?.photo.includes("http") 
						? <Avatar src={user.photo} size={45} /> 
						: <Avatar size={45} icon={<UserOutlined />} />}
					<UserInfo className="profile-text">
						<Name>{user?.first_name || "None"} {user?.last_name || "None"}</Name>
						<Title>{user?.username || "None"}</Title>
					</UserInfo>
				</Profile>
			</NavItem>
		</Dropdown>
	);
};


export default NavProfile;
