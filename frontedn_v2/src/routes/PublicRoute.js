import React  from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import { getAuthenticatedEntryByRole } from "configs/AppConfig";

const PublicRoute = () => {

	const { token, role } = useSelector(state => state.auth);

	if (!token) {
		return <Outlet/>;
	}

	const authenticatedEntry = role ? getAuthenticatedEntryByRole(role) : "/";
	return <Navigate to={authenticatedEntry} replace />;
};

export default PublicRoute;
