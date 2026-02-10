import React from "react";
import { Card, Table, Tag } from "antd";
import dayjs from "dayjs";
import AvatarStatus from "components/shared-components/AvatarStatus";


const ServicesField = () => {

	const tableColumns = [
		{
			title: "User",
			dataIndex: "name",
			render: (_, record) => (
				<div className="d-flex">
					<AvatarStatus src={record.img} name={record.name} subTitle={record.email} />
				</div>
			),
			sorter: {
				compare: (a, b) => {
					a = a.name.toLowerCase();
					b = b.name.toLowerCase();
					return a > b ? -1 : b > a ? 1 : 0;
				},
			},
		},
		{
			title: "Role",
			dataIndex: "role",
			sorter: {
				compare: (a, b) => a.role.length - b.role.length,
			},
		},
		{
			title: "Last online",
			dataIndex: "lastOnline",
			render: date => (
				<span>{dayjs.unix(date).format("MM/DD/YYYY")} </span>
			),
			sorter: (a, b) => dayjs(a.lastOnline).unix() - dayjs(b.lastOnline).unix()
		},
		{
			title: "Status",
			dataIndex: "status",
			render: status => (
				<Tag className="text-capitalize" color={status === "active" ? "cyan" : "red"}>{status}</Tag>
			),
			sorter: {
				compare: (a, b) => a.status.length - b.status.length,
			},
		}
	];
	return (
		<Card bodyStyle={{ "padding": "0px" }}>
			<div className="table-responsive">
			<Table columns={tableColumns} />
			</div>
		</Card>
	);
};

export default ServicesField;
