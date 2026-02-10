import React from "react";
import { Input, Row, Col, Card, Form, Spin, } from "antd";
import dayjs from "dayjs"; // Add this import
import "dayjs/locale/en-gb"; // Import the desired locale
import { useTranslation } from "react-i18next";

// Set the locale for dayjs
dayjs.locale("en-gb"); // Set the locale to 'en-gb' or your desired locale


const GeneralField = props => {
	const { loading, form } = props;
	const { t } = useTranslation();


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
				<Card title={t("basic_info")}>
					<Form
						layout="vertical"
						form={form}

					// initialValues={adminData}

					>
						<Row gutter={16}>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="lastName"
									label={t("last_name")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="firstName"
									label={t("first_name")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="fatherName"
									label={t("father_name")}
								>
									<Input
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="workplace" label={t("workplace")}>
									<Input className="w-100" readOnly />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="position" label={t("position")}>
									<Input className="w-100" readOnly />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="rank" label={t("rank")}>
									<Input className="w-100" readOnly />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="notes" label={t("note")}>
									<Input className="w-100" readOnly />
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="birthDate" label={t("birth_date")}>
									<Input
										className="w-100"
										readOnly
										value={form.getFieldValue("birthDate") ? dayjs(form.getFieldValue("birthDate")).format("DD.MM.YYYY") : ""}
									/>
								</Form.Item>
							</Col>
							{/* <Col xs={24} sm={24} md={12}>
								<Form.Item name="nationality" label={t("nationality")}>
									<Input className="w-100" readOnly />
								</Form.Item>
							</Col> */}
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="gender" label={t("gender")} initialValue="male">
									<Input className="w-100" readOnly />
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
