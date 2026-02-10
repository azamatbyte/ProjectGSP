import React, { useEffect, useState } from "react";
import { Card, message, Table } from "antd";
import dayjs from "dayjs";
import AuthService from "services/AuthService";
import { getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";

const SessionsField = ({ id }) => {

	const [sessions, setSessions] = useState([]);
	const [pageNumber, setPageNumber] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [totalSessions, setTotalSessions] = useState(0);
	const [loading, setLoading] = useState(true);
	const { t } = useTranslation();

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				const res = await AuthService.getAdminSessions(id, pageNumber, pageSize);
				setSessions(res?.data?.sessions);
				setTotalSessions(res?.data?.totalSessions);
			} catch (error) {
				setSessions([]);
				setTotalSessions(0);
				message.error("Ma'lumotlar topilmadi");
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [id, pageNumber, pageSize]);
	const tableColumns = [
		{
			title: t("resource"),
			dataIndex: "resource",
		},
		{
			title: t("ip_address"),
			dataIndex: "ip_address",
			sorter: (a, b) => a.ip_address.length - b.ip_address.length,
		},
		{
			title: t("last_login"),
			dataIndex: "createdAt",
			render: createdAt => (
				<span>{getDateString(createdAt)}</span>
			),
			sorter: (a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix()
		},
		{
			title: t("user_agent"),
			dataIndex: "user_agent",
			width: "30%"
		},
		{
			title: t("auth_method"),
			dataIndex: "auth_method",
			width: "20%"
		},

	];
	return (
		<Card bodyStyle={{ "padding": "0px" }}>
			<div className="table-responsive">
				<Table
					columns={tableColumns}
					dataSource={sessions}
					loading={loading}
					rowKey='id'
					pagination={{
						current: pageNumber,
						pageSize: pageSize,
						total: totalSessions,
						showSizeChanger: true,
						pageSizeOptions: ["10", "20", "30"],
						onChange: (page, pageSize) => {
							setPageNumber(page);
							setPageSize(pageSize);
						}
					}}
				/>
			</div>
		</Card>
	);
};

export default SessionsField;
