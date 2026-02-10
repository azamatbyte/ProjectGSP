import React from "react";
import { useParams } from "react-router-dom";
import AdminLogInfo from "../SignedLogInfo";

const INFO = "INFO";

const InfoAdminLog = () => {
	const params = useParams();
	return (
		<AdminLogInfo mode={INFO} param={params}/>
	);
};

export default InfoAdminLog;
