import React, { useEffect, useState } from "react";
import { Input, Row, Col, Card, Form, Select, Spin, message, } from "antd";
import { useParams } from "react-router-dom";
import RegistrationService from "services/RegistrationService";
import { useTranslation } from "react-i18next";

const { Option } = Select;

const GeneralField = props => {
	const { t } = useTranslation();
	const { id } = useParams();
	const [loading, setLoading] = useState(true);
	const [registrationData, setRegistrationData] = useState(null);

	useEffect(() => {
		const fetchAdminData = async (id) => {
			try {
				setLoading(true);
				const response = await RegistrationService.getById(id);
				setRegistrationData(response?.data?.data);
				if (response.status !== 200) throw new Error("Failed to fetch data");
			} catch (error) {
				message.error(t("failed_to_load_admin_data"));
				console.error(error);
			} finally {
				setLoading(false);
			}
		};

		if (id) {
			fetchAdminData(id);
		}
	}, [id, t]);

	if (loading) {
		return (
			<div style={{ textAlign: "center", padding: "50px" }}>
				<Spin size="large" />
			</div>
		);
	}

	return (
		<Row gutter={16}>
			<Col xs={24} sm={24} md={17}>
				<Card>
					<Form
						layout="vertical"
						initialValues={registrationData}

					>
						<Row gutter={16}>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="form_reg" label="Form">
								<Select
									className="w-100"
									style={{ minWidth: 180 }}
									placeholder="Select a form"
									onChange={(value) => {
										props.form.setFieldsValue({ form_reg: value });
									}}
									tabIndex={1}
									autoFocus
								>
									<Option value="У">У</Option>
								</Select>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="regNumber" label="Reg Number" hasFeedback validateTrigger={["onChange"]}>
								<Input
									className="w-100"
									tabIndex={2}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item
								name="regDate"
								label="Reg Date"
								// initialValue={dayjs()}
							>
								{/* <DatePicker
									format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
									className="w-100"
									tabIndex={3}
								/> */}
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="or_tab" label="Initiator">
								<Select
									showSearch
									className="w-100"
									placeholder="Initiatorni tanlang"
									style={{ width: 200, cursor: "pointer" }}
									optionFilterProp="children"
									// onChange={(value, option) => {
									// 	props.form.setFieldsValue({
									// 		or_tab: value,
									// 	});
									// }}
									// onSearch={debouncedFetchInitiators}
									// loading={initiatorFetching}
									// filterOption={false}
									// tabIndex={4}
									// options={initiatorOptions}
								/>
							</Form.Item>
							{/* <Form.Item name="or_tab" hidden={true}>
								<Input type="hidden" />
							</Form.Item> */}
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="first_name" label="First Name" >
								<Input
									className="w-100"
									min={0}
									max={100}
									tabIndex={5}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="last_name" label="Last Name">
								<Input
									className="w-100"
									min={0}
									max={100}
									tabIndex={6}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="father_name" label="Father Name" >
								<Input
									className="w-100"
									min={0}
									max={100}
									tabIndex={7}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="birthDate" label="Birth Date" >
								{/* <DatePicker className="w-100" format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT} tabIndex={8} /> */}
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="birthPlace" label="Birth Place">
								<Input
									className="w-100"
									min={0}
									max={100}
									tabIndex={9}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="residence" label="Residence">
								<Input
									className="w-100"
									min={0}
									max={100}
									tabIndex={10}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="conclusionRegNum" label="Conclusion Number">
								<Input
									className="w-100"
									min={0}
									max={100}
									tabIndex={11}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="conclusionDate" label="Conclusion Date">
								{/* <DatePicker className="w-100" format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT} tabIndex={12}/> */}
							</Form.Item>
						</Col>
					</Row>
					</Form>
				</Card>
			</Col>
		</Row>
	);
};

export default GeneralField;
