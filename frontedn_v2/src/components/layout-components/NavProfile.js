import React, { useState } from "react";
import { Dropdown, Avatar } from "antd";
import { useDispatch, useSelector } from "react-redux";
import {
	LockOutlined,
	LogoutOutlined,
	UserOutlined
} from "@ant-design/icons";
import NavItem from "./NavItem";
import Flex from "components/shared-components/Flex";
import ChangePasswordModal from "components/shared-components/ChangePasswordModal";
import { signOut } from "store/slices/authSlice";
import styled from "@emotion/styled";
import { FONT_WEIGHT, MEDIA_QUERIES, SPACER, FONT_SIZES } from "constants/ThemeConstant";
import { useTranslation } from "react-i18next";
import { useGuardedNavigate } from "utils/hooks/useUnsavedChangesGuard";


const Icon = styled.div(() => ({
	fontSize: FONT_SIZES.LG
}));

const Profile = styled.div(() => ({
	display: "flex",
	alignItems: "center"
}));

const UserInfo = styled("div")`
	padding-left: ${SPACER[2]};

	@media ${MEDIA_QUERIES.TABLET} {
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
	const navigate = useGuardedNavigate();

	const handleSignOut = () => {
		dispatch(signOut());
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
	const { user, role } = useSelector((state) => state.auth);
	const { t } = useTranslation();  // 👉 qo'shildi
	const dispatch = useDispatch();
	const navigate = useGuardedNavigate();
	const [changePasswordOpen, setChangePasswordOpen] = useState(false);

	// A password change revokes every session server-side, so the current token is
	// already dead — sign out and send the user back to the login screen.
	const handlePasswordChanged = () => {
		setChangePasswordOpen(false);
		dispatch(signOut());
		localStorage.removeItem("user");
		navigate("/login");
	};

	const isSuperAdmin = role === "superAdmin";

	const items = [
		...(isSuperAdmin
			? [{
				key: "Change Password",
				label: (
					<Flex alignItems="center" gap={SPACER[2]}>
						<Icon>
							<LockOutlined />
						</Icon>
						<span>{t("change_password")}</span>
					</Flex>
				),
				onClick: () => setChangePasswordOpen(true)
			}]
			: []),
		{
			key: "Sign Out",
			label: <MenuItemSignOut label={t("sign_out")} />
		}
	];

	return (
		<>
			<Dropdown placement="bottomRight" menu={{ items }} trigger={["click"]}>
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

			<ChangePasswordModal
				open={changePasswordOpen}
				onCancel={() => setChangePasswordOpen(false)}
				onSuccess={handlePasswordChanged}
			/>
		</>
	);
};


export default NavProfile;
