import React, { useCallback, useEffect, useState } from "react";
import {
	Card, Table, Input, Button, message, Row,
	Col,
	Pagination,
} from "antd";
import { EyeOutlined, DeleteOutlined, SearchOutlined, PlusCircleOutlined, EditOutlined, LeftCircleOutlined, UnorderedListOutlined } from "@ant-design/icons";
import AvatarStatus from "components/shared-components/AvatarStatus";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
// ...existing code...
import { getDateString } from "utils/aditionalFunctions";
import InitiatorService from "services/InitiatorService";
import { useTranslation } from "react-i18next";


const InitiatorList = () => {
	const navigate = useNavigate();
	const [list, setList] = useState([]);
	const [pageNumber, setPageNumber] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const { t } = useTranslation();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			const res = await InitiatorService.getList(pageNumber, pageSize, search);
			setList(res?.data?.data);
			setTotal(res?.data?.total_number);
		} catch (error) {
			setList([]);
			setTotal(0);
			message.error(t("data_not_found"));
		} finally {
			setLoading(false);
		}
	}, [pageNumber, pageSize, search, t]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const dropdownMenu = row => ({
		items: [
			{
				key: "view",
				label: (
					<Flex alignItems="center">
						<EyeOutlined />
						<span className="ml-2">{t("view_details")}</span>
					</Flex>
				),
				onClick: () => viewDetails(row)
			},
			{
				key: "edit",
				label: (
					<Flex alignItems="center">
						<EditOutlined />
						<span className="ml-2">{t("edit")}</span>
					</Flex>
				),
				onClick: () => editInitiator(row)
			},
			{
				key: "delete",
				label: (
					<Flex alignItems="center">
						<DeleteOutlined />
						<span className="ml-2">{t("delete")}</span>
					</Flex>
				),
				onClick: () => deleteRow(row)
			}
		]
	});


	const addInitiator = () => {
		navigate("/app/apps/initiator/add-initiator");
	};

	const viewDetails = row => {
		navigate(`/app/apps/initiator/info-initiator/${row.id}`);
	};
	const editInitiator = row => {
		console.log("Row data:", row);
		navigate(`/app/apps/initiator/edit-initiator/${row.id}`);
	};

	const deleteRow = async row => {
		try {
			await InitiatorService.deleteById(row.id);
			message.success(t("initiator_successfully_deleted"));
			fetchData();
		} catch (error) {
			message.error(t("error_deleting_initiator"));
		}
	};
	const backHandle = () => {
		navigate(-1);
	};

	const tableColumns = [
		{
			title: <UnorderedListOutlined />,
			dataIndex: "actions",
			width: "50px",
			render: (_, elm) => (
				<div className="text-right">
					<EllipsisDropdown menu={dropdownMenu(elm)} />
				</div>
			)
		},
		{
			title: t("full_name"),
			dataIndex: "fullName",
			render: (_, record) => (
				<div className="d-flex">
					<AvatarStatus size={25} icon={<UserOutlined />} name={record.fullName} />
				</div>
			),
			// sorter: (a, b) => utils.antdTableSorter(a, b, "fullName")
		},
		{
			title: t("notes"),
			dataIndex: "notes",
			// sorter: (a, b) => utils.antdTableSorter(a, b, "notes"),
		},
		{
			title: t("createdAt"),
			dataIndex: "createdAt",
			// sorter: (a, b) => utils.antdTableSorter(a, b, "createdAt")
		}

	];

	const fromatFullName = (lastName, firstName, fatherName) => {
		if (!fatherName) {
			return lastName + " " + firstName;
		}
		const fullName = lastName + " " + firstName + " " + fatherName;
		if (fullName.length > 20) {
			return lastName + " " + firstName + " " + fatherName.substring(0, 10) + "...";
		}
		return fullName;
	};

	return (
		<Card>
			<Flex alignItems="center" justifyContent="space-between" mobileFlex={false}>
				<Flex className="mb-1" mobileFlex={false}>
					<div className="mr-md-3 mb-3">
						<Input placeholder={t("search")} autoFocus prefix={<SearchOutlined />} onChange={e => setSearch(e.target.value)} />
					</div>
				</Flex>
				<Flex className='mb-1'>
					<div className='mb-3 d-flex gap-2'>
						<Button onClick={addInitiator} type="primary" icon={<PlusCircleOutlined />} block>{t("add")}</Button>
						<Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
					</div>
				</Flex>
			</Flex>
			<div className="table-responsive">
				<Table
					columns={tableColumns}
					dataSource={list.map(elm => ({
						...elm,
						fullName: fromatFullName(elm?.last_name, elm?.first_name, elm?.father_name),
						createdAt: getDateString(elm?.createdAt)
					}))}
					rowKey='id'
					loading={loading}
					// rowSelection={{
					// 	selectedRowKeys: selectedRowKeys,
					// 	type: 'checkbox',
					// 	preserveSelectedRowKeys: false,
					// 	...rowSelection,
					// }}
					pagination={false}
				/>
				<Row
					style={{
						marginTop: 16,
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<Col>
						<span style={{ fontWeight: "bold" }}>
							{t("total_number_of_entries")}: {total}
						</span>
					</Col>
					<Col>
						<Pagination
							current={pageNumber}
							pageSize={pageSize}
							total={total}
							showSizeChanger
							pageSizeOptions={["10", "20", "50", "100"]}
							onShowSizeChange={(current, size) => {
								setPageSize(size);
								setPageNumber(1);
							}}
							onChange={(page, pageSize) => {
								setPageNumber(page);
							}}
						/>
					</Col>
				</Row>
			</div>
		</Card>
	);
};

export default InitiatorList;
