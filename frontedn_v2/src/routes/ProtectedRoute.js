import React, { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { 
	AUTH_PREFIX_PATH, 
	UNAUTHENTICATED_ENTRY, 
	REDIRECT_URL_KEY 
} from "configs/AppConfig";
import { getByToken } from "store/slices/authSlice";


const ProtectedRoute = () => {
	
	const location = useLocation();
	const dispatch = useDispatch();

	const { token, user, isAuth } = useSelector(state => state.auth);

	useEffect(() => {
		if(!user) {
			dispatch(getByToken());
		}
	},[user, token, isAuth, dispatch]);

	if (!token) {
		return <Navigate to={`${AUTH_PREFIX_PATH}${UNAUTHENTICATED_ENTRY}?${REDIRECT_URL_KEY}=${location.pathname}`} replace />;
	}

	return <Outlet />;
};

export default ProtectedRoute;