import React from "react";
import { useParams } from "react-router-dom";
import AdminLogInfo from "../AdminLogInfo";

const INFO = "INFO";

const InfoAdminLog = () => {
	const params = useParams();
	return (
		<AdminLogInfo mode={INFO} param={params}/>
	);
};

export default InfoAdminLog;
