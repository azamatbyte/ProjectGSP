import React, { useMemo } from "react";
import { Routes as RouterRoutes, Route, Navigate } from "react-router-dom";
import { AUTHENTICATED_ENTRY } from "configs/AppConfig";
import { protectedRoutes, publicRoutes } from "configs/RoutesConfig";
import ProtectedRoute from "./ProtectedRoute";
import PublicRoute from "./PublicRoute";
import AppRoute from "./AppRoute";
import { useSelector } from "react-redux";
import Loading from "components/shared-components/Loading";

const Routes = () => {

	const { token, role } = useSelector(state => state.auth);
	const isResolvingRole = Boolean(token) && !role;
	const permissionProtectedRouters = useMemo(() => {
		if (!role) {
			return [];
		}
		return protectedRoutes.filter(route => route.role.includes(role));
	}, [role]);

	return (
		<RouterRoutes>
			<Route path="/" element={<ProtectedRoute />}>
				<Route path="/" element={<Navigate replace to={AUTHENTICATED_ENTRY} />} />
				{permissionProtectedRouters.map((route, index) => {
					return (
						<Route 
							key={route.key + index} 
							path={route.path}
							element={
								<AppRoute
									routeKey={route.key} 
									component={route.component}
									{...route.meta} 
								/>
							}
						/>
					);
				})}
				<Route
					path="*"
					element={isResolvingRole ? <Loading cover="content" /> : <Navigate to="/" replace />}
				/>
			</Route>
			<Route path="/" element={<PublicRoute />}>
				{publicRoutes.map(route => {
					return (
						<Route 
							key={route.path} 
							path={route.path}
							element={
								<AppRoute
									routeKey={route.key} 
									component={route.component}
									{...route.meta} 
								/>
							}
						/ >
					);
				})}
			</Route>
		</RouterRoutes>
	);
};

export default Routes;
