import React, {useEffect, useState, useCallback} from "react";
import { Card, Table,  Input, Button, Menu, Switch, message } from "antd";
import { EyeOutlined, DeleteOutlined, SearchOutlined, PlusCircleOutlined, CheckOutlined, CloseOutlined, EditOutlined } from "@ant-design/icons";
import AvatarStatus from "components/shared-components/AvatarStatus";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import utils from "utils";
import AuthService from "services/AuthService";
import { getDateString } from "utils/aditionalFunctions";

const AdminList = () => {
	const navigate = useNavigate();
	const [list, setList] = useState([]);
	const [pageNumber, setPageNumber] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [selectedRows, setSelectedRows] = useState([]);
	const [selectedRowKeys, setSelectedRowKeys] = useState([]);
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			const res = await AuthService.getList(pageNumber, pageSize, search);
			setList(res?.data?.users);
			setTotal(res?.data?.total_users);
		} catch (error) {
			setList([]);
			setTotal(0);
			message.error("Ma'lumotlar topilmadi");
		} finally {
			setLoading(false);
		}
	}, [pageNumber, pageSize, search]);

	useEffect(() => {		
		fetchData();
	}, [fetchData]);

	const dropdownMenu = row => (
		<Menu>
			<Menu.Item onClick={() => editAdmin(row)}>
				<Flex alignItems="center">
					<EditOutlined />
					<span className="ml-2">Edit Admin</span>
				</Flex>
			</Menu.Item>
			<Menu.Item onClick={() => viewDetails(row)}>
				<Flex alignItems="center">
					<EyeOutlined />
					<span className="ml-2">View Details</span>
				</Flex>
			</Menu.Item>
			<Menu.Item onClick={() => deleteRow(row)}>
				<Flex alignItems="center">
					<DeleteOutlined />
					<span className="ml-2">{selectedRows.length > 0 ? `Delete (${selectedRows.length})` : "Delete"}</span>
				</Flex>
			</Menu.Item>
		</Menu>
	);
	
	const addAdmin = () => {
		navigate("/app/apps/admin/add-admin");
	};
	
	const editAdmin = row => {
		navigate(`/app/apps/admin/edit-admin/${row.id}`);
	};

	const viewDetails= row => {
		navigate(`/app/apps/admin/info-admin/${row.id}`);
	};
	
	const deleteRow = async row => {
		try {
			await AuthService.deleteById(row.id);
			message.success("Admin muvaffaqiyatli o'chirildi");
			fetchData();
		} catch (error) {
			message.error("Adminni o'chirishda xatolik yuz berdi");
		}
	};

	const handleStatusChange = async (checked, record) => {
		console.log(checked, record);
		try {
			const res = await AuthService.statusChange(record.id, checked ? "active" : "inactive");
			if (res.status === 200) {
				message.success("Status muvaffaqiyatli yangilandi");
				fetchData();
			} else {
				message.error("Statusni yangilashda xatolik yuz berdi");
			}
		} catch (error) {
			message.error("Statusni yangilashda xatolik yuz berdi");
		}
	};

	const tableColumns = [
		{
			title: "Full Name",
			dataIndex: "fullName",
			render: (_, record) => (
				<div className="d-flex">
					<AvatarStatus size={25} icon={<UserOutlined />} name={record.fullName} />
				</div>
			),
			sorter: (a, b) => utils.antdTableSorter(a, b, "fullName")
		},
		{
			title: "Username",
			dataIndex: "username",
			sorter: (a, b) => utils.antdTableSorter(a, b, "username")
		},
		{
			title: "Role",
			dataIndex: "role",
			sorter: (a, b) => utils.antdTableSorter(a, b, "role")
		},
		{
			title: "Status",
			dataIndex: "status",
			sorter: (a, b) => utils.antdTableSorter(a, b, "status"),
			render: (text, record) => (
				<Switch 
					// onClick={()=>{console.log(text);}}
					checkedChildren={<CheckOutlined />}
					unCheckedChildren={<CloseOutlined />}
					checked={text === "active"}
					onChange={(checked) => handleStatusChange(checked, record)}
				/>
			)
		},
		{
			title: "Created At",
			dataIndex: "createdAt",
			width: "15%",
			sorter: (a, b) => utils.antdTableSorter(a, b, "createdAt")
		},
		{
			title: "Actions",
			dataIndex: "actions",
			render: (_, elm) => (
				<div className="text-right">
					<EllipsisDropdown menu={dropdownMenu(elm)}/>
				</div>
			)
		}
	];
	
	const rowSelection = {
		onChange: (key, rows) => {
			setSelectedRows(rows);
			setSelectedRowKeys(key);
		}
	};

	const onSearch = e => {
		setPageNumber(1);
		setSearch(e.target.value);
		setSelectedRowKeys([]);
	};

	const fromatFullName = (firstName, lastName, fatherName) => {
		if(!fatherName) {
			return firstName + " " + lastName;
		}
		const fullName = firstName + " " + lastName + " " + fatherName;
		if(fullName.length > 20) {
			return firstName + " " + lastName + " " + fatherName.substring(0, 10)+"...";
		}
		return fullName;
	};

	return (
		<Card>
			<Flex alignItems="center" justifyContent="space-between" mobileFlex={false}>
				<Flex className="mb-1" mobileFlex={false}>
					<div className="mr-md-3 mb-3">
						<Input placeholder="Search" autoFocus prefix={<SearchOutlined />} onChange={e => onSearch(e)}/>
					</div>
				</Flex>
				<Flex className="mb-1">
					<div className="mr-md-3 mb-3">
						<Button onClick={addAdmin} type="primary" icon={<PlusCircleOutlined />} block>Add admin</Button>
					</div>
				</Flex>
			</Flex>
			<div className="table-responsive">
				<Table 
					columns={tableColumns} 
					dataSource={list.map(elm => ({
						...elm,
						fullName: fromatFullName(elm?.first_name, elm?.last_name, elm?.father_name),
						createdAt: getDateString(elm?.createdAt)
					}))} 
					rowKey='id' 
					loading={loading}
					rowSelection={{
						selectedRowKeys: selectedRowKeys,
						type: "checkbox",
						preserveSelectedRowKeys: false,
						...rowSelection,
					}}
					pagination={{
						current: pageNumber,
						pageSize: pageSize,
						total: total,
						showSizeChanger: true,
						pageSizeOptions: ["10", "20", "50"],
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

export default AdminList;
