import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card, Table, Input, Button, Switch, message, Col, Row, Pagination } from "antd";
import { EyeOutlined, DeleteOutlined, SearchOutlined, PlusCircleOutlined, CheckOutlined, CloseOutlined, EditOutlined, LeftCircleOutlined, UnorderedListOutlined } from "@ant-design/icons";
import AvatarStatus from "components/shared-components/AvatarStatus";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
// ...existing code...
import AuthService from "services/AuthService";
import { getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";


const AdminList = () => {
	const navigate = useNavigate();
	const [list, setList] = useState([]);
	const { t } = useTranslation();
	const [pageNumber, setPageNumber] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [sortedColumns, setSortedColumns] = useState([]);

	const handleTableChange = useCallback((pagination, filters, sorter) => {
		const sorters = Array.isArray(sorter) ? sorter : [sorter];
		const newSorted = sorters
			.filter(s => s.order)
			.map(s => ({ field: s.columnKey || s.field, order: s.order === 'ascend' ? 'ASC' : 'DESC' }));
		setSortedColumns(newSorted);
		setPageNumber(1);
	}, []);

	const sortOrderMap = useMemo(() => {
		const map = {};
		sortedColumns.forEach((s) => {
			map[s.field] = s.order === 'ASC' ? 'ascend' : 'descend';
		});
		return map;
	}, [sortedColumns]);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			const res = await AuthService.getList(pageNumber, pageSize, search, "", sortedColumns);
			setList(res?.data?.users);
			setTotal(res?.data?.total_users);
		} catch (error) {
			setList([]);
			setTotal(0);
			message.error(t("data_not_found"));
		} finally {
			setLoading(false);
		}
	}, [pageNumber, pageSize, search, sortedColumns, t]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const dropdownMenu = row => ({
		items: [
			{
				key: "edit",
				label: (
					<Flex alignItems="center">
						<EditOutlined />
						<span className="ml-2">{t("edit_admin")}</span>
					</Flex>
				),
				onClick: () => editAdmin(row)
			},
			{
				key: "view",
				label: (
					<Flex alignItems="center">
						<EyeOutlined />
						<span className="ml-2">{t("view_details_admin")}</span>
					</Flex>
				),
				onClick: () => viewDetails(row)
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
	const addAdmin = () => {
		navigate("/app/apps/admin/add-admin");
	};

	const editAdmin = row => {
		navigate(`/app/apps/admin/edit-admin/${row.id}`);
	};

	const viewDetails = row => {
		console.log("admin view details");
		console.log("rowwww", row?.id);
		navigate(`/app/apps/admin/info-admin/${row?.id}`);
	};

	const deleteRow = async row => {
		try {
			await AuthService.deleteById(row.id);
			message.success(t("admin_deleted_successfully"));
			fetchData();
		} catch (error) {
			message.error(t("error_deleting_admin"));
		}
	};

	const handleStatusChange = async (checked, record) => {
		console.log(checked, record);
		try {
			const res = await AuthService.statusChange(record.id, checked ? "active" : "inactive");
			if (res.status === 200) {
				message.success(t("status_updated_successfully"));
				fetchData();
			} else {
				message.error(t("error_updating_status"));
			}
		} catch (error) {
			message.error(t("error_updating_status"));
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
			key: "last_name",
			sorter: { multiple: 1 },
			sortDirections: ['ascend', 'descend'],
			sortOrder: sortOrderMap['last_name'] || null,
			render: (_, record) => (
				<div className="d-flex">
					{record?.photo && record?.photo.includes("http") ? (
						<AvatarStatus src={record.photo} size={25} name={record.fullName} />
					) : (
						<AvatarStatus size={25} icon={<UserOutlined />} name={record.fullName} />
					)}
				</div>
			),
		},
		{
			title: t("workplace"),
			dataIndex: "workplace",
			key: "workplace",
			sorter: { multiple: 2 },
			sortDirections: ['ascend', 'descend'],
			sortOrder: sortOrderMap['workplace'] || null,
			render: (rank) => (
				<div className="d-flex">
					<span>{rank ? rank : t("-")}</span>
				</div>
			),
		},
		{
			title: t("rank"),
			dataIndex: "rank",
			key: "rank",
			sorter: { multiple: 3 },
			sortDirections: ['ascend', 'descend'],
			sortOrder: sortOrderMap['rank'] || null,
			render: (position) => (
				<div className="d-flex">
					<span>{position ? position : t("-")}</span>
				</div>
			),
		},
		{
			title: t("phone"),
			dataIndex: "phone",
			key: "phone",
			sorter: { multiple: 4 },
			sortDirections: ['ascend', 'descend'],
			sortOrder: sortOrderMap['phone'] || null,
			render: (phone) => (
				<div className="d-flex">
					<span>{phone ? phone : t("unknown")}</span>
				</div>
			)
		},
		{
			title: t("username"),
			dataIndex: "username",
			key: "username",
			sorter: { multiple: 5 },
			sortDirections: ['ascend', 'descend'],
			sortOrder: sortOrderMap['username'] || null,
		},
		{
			title: t("role"),
			dataIndex: "role",
			key: "role",
			sorter: { multiple: 6 },
			sortDirections: ['ascend', 'descend'],
			sortOrder: sortOrderMap['role'] || null,
			render: (role) => (
				<span>{role === "admin" ? t("operator") : role === "superAdmin" ? t("super_admin") : role}</span>
			)
		},
		{
			title: t("status"),
			dataIndex: "status",
			key: "status",
			sorter: { multiple: 7 },
			sortDirections: ['ascend', 'descend'],
			sortOrder: sortOrderMap['status'] || null,
			render: (text, record) => (
				<Switch
					checkedChildren={<CheckOutlined />}
					unCheckedChildren={<CloseOutlined />}
					checked={text === "active"}
					onChange={(checked) => handleStatusChange(checked, record)}
				/>
			)
		},
		{
			title: t("created_at"),
			dataIndex: "createdAt",
			key: "createdAt",
			width: "15%",
			sorter: { multiple: 8 },
			sortDirections: ['ascend', 'descend'],
			sortOrder: sortOrderMap['createdAt'] || null,
		}
	];



	const onSearch = e => {
		setPageNumber(1);
		setSearch(e.target.value);
	};

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
						<Input placeholder={t("search")} autoFocus prefix={<SearchOutlined />} onChange={e => onSearch(e)} />
					</div>
				</Flex>
				<Flex className="mb-1">
					<div className="d-flex flex-wrap">

						<Button
							onClick={addAdmin}
							type="primary"
							icon={<PlusCircleOutlined />}
							className="mr-2 mb-md-0"
						>
							{t("add")}
						</Button>
						<Button
							className="mb-2 mb-md-0"
							onClick={backHandle}
							tabIndex={6}
						>
							<LeftCircleOutlined />
							{t("back")}
						</Button>
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
					onChange={handleTableChange}
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

export default AdminList;
