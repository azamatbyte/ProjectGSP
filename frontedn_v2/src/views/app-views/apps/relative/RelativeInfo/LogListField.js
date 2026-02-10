import React, { useEffect, useState } from "react";
import { Card, Table, Select, Tooltip, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import utils from "utils";
import { getDateString, getDateDayString, getDateDayStringRelative } from "utils/aditionalFunctions";
import FormService from "services/FormService";
import { useTranslation } from "react-i18next";

const { Option } = Select;

const LogList = ({ id }) => {
	const { t } = useTranslation();
	const [list, setList] = useState([]);
	const [loading, setLoading] = useState(false);
	const [pageNumber, setPageNumber] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [total, setTotal] = useState(0);
	const [field, setField] = useState("");
	const [modalVisible, setModalVisible] = useState(false);
	const [modalContent, setModalContent] = useState("");
	const [modalTitle, setModalTitle] = useState("");

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				const response = await FormService.getLogList("Relatives", id, field, pageNumber, pageSize);

				setList(response?.data?.logs);
				setTotal(response?.data?.totalCount);
			} catch (error) {
				console.log(error);
				setList([]);
				setTotal(0);
				setLoading(false);
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [field, pageNumber, pageSize, id, t]);

	const categories = [
		{ key: "firstName", label: t("first_name") },
		{ key: "lastName", label: t("last_name") },
		{ key: "fatherName", label: t("father_name") },
		{ key: "birthDate", label: t("birth_date") },
		{ key: "birthYear", label: t("birth_year") },
		{ key: "birthPlace", label: t("birth_place") },
		{ key: "workplace", label: t("workplace") },
		{ key: "position", label: t("position") },
		{ key: "relationDegree", label: t("relation_degree") },
		{ key: "notes", label: t("compr_info") },
		{ key: "additionalNotes", label: t("comment") },
		{ key: "model", label: t("model") },
		{ key: "nationality", label: t("nationality") },
		{ key: "residence", label: t("residence") },
	];


	const tableColumns = [
		{
			title: t("field_name"),
			dataIndex: "fieldName",
			// sorter: (a, b) => utils.antdTableSorter(a, b, "fieldName"),
			render: (fieldName) => (
				<div>
					{categories.find(elm => elm.key === fieldName)?.label || fieldName}
				</div>
			)
		},
		{
			title: t("old_value"),
			dataIndex: "oldValue",
			// sorter: (a, b) => utils.antdTableSorter(a, b, "oldValue"),
			render: (oldValue, record) => {
				// 1️⃣ Date fieldlar ro‘yxati
				const dateFields = ["regEndDate", "regDate", "expiredDate"];

				// 2️⃣ Agar date bo‘lsa → formatlab chiqaramiz
				if (dateFields.includes(record?.fieldName)) {
					return <div>{getDateDayStringRelative(oldValue)}</div>;
				}

				// 3️⃣ Oddiy text uchun umumiy logic
				const text = oldValue ?? "";
				const isLong = text.length > 50;
				const truncatedText = isLong ? text.slice(0, 50) + "..." : text;

				return (
					<span
						style={{
							cursor: isLong ? "pointer" : "default",
							color: isLong ? "#1890ff" : "inherit",
						}}
						onClick={() => {
							if (isLong) {
								setModalTitle(t("old_value"));
								setModalContent(text);
								setModalVisible(true);
							}
						}}
					>
						{truncatedText}
					</span>
				);
			},
		},
		{
			title: t("new_value"),
			dataIndex: "newValue",
			// sorter: (a, b) => utils.antdTableSorter(a, b, "newValue"),
			render: (newValue, record) => {
				// Date fieldlar
				const dateFields = ["regEndDate", "regDate", "expiredDate"];

				// Agar date bo‘lsa → formatlab chiqaramiz
				if (dateFields.includes(record?.fieldName)) {
					return <div>{getDateString(newValue)}</div>;
				}

				// Text uchun umumiy logic
				const text = newValue ?? "";
				const isLong = text.length > 50;
				const truncatedText = isLong ? text.slice(0, 50) + "..." : text;

				return (
					<span
						style={{
							cursor: isLong ? "pointer" : "default",
							color: isLong ? "#1890ff" : "inherit",
						}}
						onClick={() => {
							if (isLong) {
								setModalTitle(t("new_value"));
								setModalContent(text);
								setModalVisible(true);
							}
						}}
					>
						{truncatedText}
					</span>
				);
			},
		},
		{
			title: t("executed_by"),
			dataIndex: "executor",
			render: (_, elm) => {
				const fullName = `${elm?.executor?.last_name ? elm?.executor?.last_name.slice(0, 1) + "." : ""} ${elm?.executor?.first_name ? elm?.executor?.first_name.slice(0, 20) : ""}`;
				return (
					<Tooltip title={fullName}>
						<span>{fullName}</span>
					</Tooltip>
				);
			},
			// sorter: (a, b) => utils.antdTableSorter(a, b, "executor")
		},
		{
			title: t("createdAt"),
			dataIndex: "createdAt",
			// sorter: (a, b) => utils.antdTableSorter(a, b, "createdAt"),
			render: (createdAt) => (
				<div>
					{getDateString(createdAt)}
				</div>
			)
		}
	];
	const handleShowCategory = value => {
		if (value !== "all") {
			setField(value);
		} else {
			setField("");
		}
	};

	return (
		<Card>
			<Flex alignItems="center" justifyContent="space-between" mobileFlex={false}>
				<Flex className="mb-1" mobileFlex={false}>
					{/* <div className="mr-md-3 mb-3">
						<Input placeholder="Search" prefix={<SearchOutlined />} onChange={e => onSearch(e)}/>
					</div> */}
					<div className="mb-3">
						<Select
							defaultValue={t("all")}
							className="w-100"
							style={{ minWidth: 180 }}
							onChange={handleShowCategory}
							placeholder={t("category")}
						>
							<Option value="all">{t("all")}</Option>
							{
								categories.map(elm => (
									<Option key={elm.key} value={elm.key}>{elm.label}</Option>
								))
							}
						</Select>
					</div>
				</Flex>
			</Flex>
			<div className="table-responsive">
				<Table
					columns={tableColumns}
					dataSource={list}
					// rowKey='id' 
					loading={loading}
					// rowSelection={{
					// 	selectedRowKeys: selectedRowKeys,
					// 	type: 'checkbox',
					// 	preserveSelectedRowKeys: false,
					// 	...rowSelection,
					// }}
					pagination={{
						current: pageNumber,
						pageSize: pageSize,
						showSizeChanger: true,
						pageSizeOptions: ["10", "20", "50"],
						total: total,
						onChange: (pageNumber, pageSize) => {
							setPageNumber(pageNumber);
							setPageSize(pageSize);
						}
					}}
				/>
			</div>
			<Modal
				title={modalTitle}
				open={modalVisible}
				onCancel={() => setModalVisible(false)}
				footer={null}
				width={800}
				style={{ top: 20 }}
			>
				<div
					style={{
						maxHeight: "70vh",
						overflowY: "auto",
						wordBreak: "break-word",
						whiteSpace: "pre-wrap",
						padding: "10px 0"
					}}
				>
					{modalContent}
				</div>
			</Modal>
		</Card>
	);
};

export default LogList;
