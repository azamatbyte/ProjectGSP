import React from "react";
import { Card, Table } from "antd";
import dayjs from "dayjs";

const SessionsField = () => {
	const tableColumns = [
		{
			title: "Resource",
			dataIndex: "resource",
		},
		{
			title: "Ip_Address",
			dataIndex: "ipAddress",
			sorter: {
				compare: (a, b) => a.role.length - b.role.length,
			},
		},
		{
			title: "Last Login",
			dataIndex: "lastLogin",
			render: date => (
				<span>{dayjs.unix(date).format("MM/DD/YYYY")} </span>
			),
			sorter: (a, b) => dayjs(a.lastLogin).unix() - dayjs(b.lastLogin).unix()
		},
		{
			title: "User Agent",
			dataIndex: "useragent"
		},
		{
			title: "Auth Method",
			dataIndex: "authMethod"
		},

	];
	return (
		<Card bodyStyle={{ "padding": "0px" }}>
			<div className="table-responsive">
				<Table columns={tableColumns} />
			</div>
		</Card>
	);
};

export default SessionsField;
